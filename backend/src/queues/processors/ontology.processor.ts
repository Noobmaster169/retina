import { type LlmClient, readShipment, ShipmentReadOutput } from "../../agents";
import { config } from "../../config";
import { ComparisonField } from "../../contracts";
import type { Queryable, Transactor } from "../../db";
import { TerminalError } from "../../lib/errors";
import { childLogger } from "../../lib/logger";
import type { LiveCalls } from "../../live";
import { documents, emailRuns, emails, extractions, fieldDiffs, llmCalls } from "../../ontology/repositories";
import { loadPrompt } from "../../agents/prompts/registry";
import { assembleShipment, type SettledField, type ShipmentSources } from "../../pipeline/ontology";
import type { ObjectStore } from "../../storage";
import type { OntologyJob } from "../names";
import { resolveSightings, type ResolveDeps } from "./ontology-resolve";
import { writeOntology } from "./ontology-write";

const log = childLogger({ module: "ontology.processor" });

/**
 * One email's semantic reading.
 *
 * It runs after the email's verdict is written and touches nothing the score
 * reads: `email_shipments` and `entity_sightings` are its own tables, and a
 * failure here leaves the verdict exactly where it was. That is the whole
 * reason it is a queue of its own rather than a stage of compare.
 */

export interface OntologyDeps extends ResolveDeps {
  pool: Queryable;
  llm: LlmClient;
  store: ObjectStore;
  /** How the reading is written as one. A seam, so a test hands in the transaction it rolls back. */
  tx: Transactor;
  live?: LiveCalls;
}

const SHIPMENT_PROMPT = "v1";
const TEXT_CUT = "\n[the text was cut here for length]";

/** Everything but a shipment gets a reduced reading: the people, the vessel and the date. */
const FULL_CATEGORIES = new Set(["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY"]);

function cut(text: string): string {
  return text.length > config.SHIPMENT_TEXT_CHARS ? text.slice(0, config.SHIPMENT_TEXT_CHARS) + TEXT_CUT : text;
}

/**
 * What the pipeline already settled about the seven fields.
 *
 * A reviewer's correction first, then the instruction's reading: the same
 * precedence every screen uses. `disputed` is the judge's word that the two
 * documents differed, which is what keeps a port off a wrong draft bill out of
 * a question about where cargo went.
 */
async function settledFields(db: Queryable, emailRunId: string): Promise<SettledField[]> {
  const readings = await extractions.listForEmailRun(db, emailRunId);
  const si = readings.find((reading) => reading.role === "SI") ?? readings[0];
  if (!si) return [];

  const differed = new Set(await fieldDiffs.differedForEmailRun(db, emailRunId));
  return ComparisonField.options.map((field) => ({
    field,
    value: si.humanValues[field] ?? si.fields[field].value,
    disputed: differed.has(field),
  }));
}

async function sourcesOf(deps: OntologyDeps, emailId: string, emailRunId: string): Promise<{ sources: ShipmentSources; subject: string; body: string; docs: { role: string; text: string }[] }> {
  const email = await emails.get(deps.pool, emailId);
  if (!email) throw new TerminalError(`email ${emailId} is not stored`);

  const parsed = await documents.listForEmailRun(deps.pool, emailRunId);
  const docs: { role: string; text: string }[] = [];
  for (const document of parsed) {
    if (!document.textObjectKey) continue;
    docs.push({ role: document.role, text: (await deps.store.get(document.textObjectKey)).toString("utf8") });
  }
  return {
    sources: { subject: email.subject, body: email.body, documents: docs.map((doc) => doc.text) },
    subject: email.subject,
    body: email.body,
    docs,
  };
}

export async function processOntology(deps: OntologyDeps, data: OntologyJob): Promise<void> {
  const emailRunId = String(data.emailRunId);
  const context = await emailRuns.context(deps.pool, emailRunId);
  if (!context) throw new TerminalError(`email run ${emailRunId} does not exist`);

  const { sources, subject, body, docs } = await sourcesOf(deps, data.emailId, emailRunId);
  const prompt = loadPrompt("shipment-read", SHIPMENT_PROMPT, config.LLM_MODEL_SHIPMENT_READ);

  // An answer already paid for on an earlier attempt is reused, the same way
  // every other step's retry does.
  const earlier = ShipmentReadOutput.safeParse(await llmCalls.latestAccepted(deps.pool, emailRunId, "shipment-read", prompt.version));
  const reading = earlier.success
    ? earlier.data
    : (
        await readShipment(
          deps,
          prompt,
          {
            subject,
            body: cut(body),
            documents: docs.map((doc) => ({ role: doc.role, text: cut(doc.text) })),
            reduced: !FULL_CATEGORIES.has(context.category ?? ""),
          },
          { runId: context.runId, emailRunId },
        )
      ).value;

  const assembled = assembleShipment(reading, sources, await settledFields(deps.pool, emailRunId));
  for (const drop of assembled.dropped) {
    log.info({ emailId: data.emailId, stage: "ontology", what: drop.what, reason: drop.reason }, "a value was dropped: its quote is not in the text");
  }

  const resolved = await resolveSightings(deps, { runId: context.runId, emailRunId, emailId: data.emailId }, assembled);
  // One transaction for the whole reading: a half-written one, with three of
  // five things created and no shipment, is the shape a retry cannot tell from
  // a finished one.
  const touched = await deps.tx((tx) => writeOntology(tx, data, assembled, resolved));

  log.info(
    { emailId: data.emailId, stage: "ontology", things: touched.length, sightings: resolved.sightings.length, judged: resolved.judged, dropped: assembled.dropped.length },
    "read the shipment",
  );
}
