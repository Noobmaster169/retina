import type { PoolClient } from "pg";

import { attachments, documents, emailRuns, entities, extractions } from "../src/ontology/repositories";
import type { ExtractedFields } from "../src/pipeline/compare";
import { resolveEntities } from "../src/pipeline/ontology";
import { keys } from "../src/storage";
import { seedEmail, seedRun } from "./db";

/**
 * A small inbox for the chat's tests: one run, a few emails whose shipping
 * instructions were read, and the ports and parties resolved out of them. All
 * inside the caller's transaction, so nothing outlives the test.
 *
 * The names are invented. Nothing here is copied from the organisers' inbox.
 */

export interface SeededShipment {
  shipper: string;
  consignee: string;
  notify: string;
  pol: string;
  pod: string;
}

export const ACME_ME = "ACME FINE PAPER TRADING (MIDDLE EAST) FZE";
export const ACME_FE = "ACME FAR EAST SDN BHD";
export const NORTHWIND = "NORTHWIND STATIONERY LLC";
export const ALPHA = "PORT ALPHA, ATLANTIS (ATALP)";
export const BETA = "BETA HARBOUR, LEMURIA (LMBET)";
export const GAMMA = "GAMMA BAY, LEMURIA";

export const SHIPMENTS: SeededShipment[] = [
  { shipper: ACME_ME, consignee: NORTHWIND, notify: NORTHWIND, pol: ALPHA, pod: BETA },
  { shipper: ACME_FE, consignee: NORTHWIND, notify: ACME_FE, pol: ALPHA, pod: GAMMA },
  { shipper: ACME_ME, consignee: "ZEPHYR PAPER CO., LTD", notify: NORTHWIND, pol: ALPHA, pod: BETA },
];

function field(value: string, label: string) {
  return { value, placeholder: null, source_quote: `${label}: ${value}`, confidence: 0.98, note: null };
}

function fieldsOf(shipment: SeededShipment): ExtractedFields {
  return {
    shipper: field(shipment.shipper, "Shipper"),
    consignee: field(shipment.consignee, "Consignee"),
    notify_party: field(shipment.notify, "Notify"),
    port_of_loading: field(shipment.pol, "POL"),
    port_of_discharge: field(shipment.pod, "POD"),
    container_count: field("2 x 40'HC", "Containers"),
    gross_weight_kg: field("41,000 KG", "Gross Weight"),
  };
}

const ALL_FOUND = {
  shipper: true, consignee: true, notify_party: true, port_of_loading: true,
  port_of_discharge: true, container_count: true, gross_weight_kg: true,
};

export interface SeededInbox {
  runId: string;
  emailIds: string[];
  /** Resolved ids by canonical name, as the tools will report them. */
  idOf(canonical: string): string;
}

/** `replay` runs the same emails again in a second run, which is what makes mentions outnumber emails. */
export async function seedInbox(tx: PoolClient, shipments = SHIPMENTS, replay: string[] = []): Promise<SeededInbox> {
  const run = await seedRun(tx);
  const emailIds: string[] = [];
  for (const [index, shipment] of shipments.entries()) {
    const emailId = replay[index] ?? (await seedEmail(tx));
    emailIds.push(emailId);
    await emailRuns.insert(tx, { runId: run.id, emailId, stage: "done", priority: 600 });
    const emailRunId = (await emailRuns.idOf(tx, run.id, emailId)) as string;
    await attachments.insert(tx, {
      runId: run.id, emailId, filename: `${emailId}_SI.txt`, sourcePath: `attachments/${emailId}_SI.txt`, role: "SI",
      objectKey: keys.attachment(run.id, emailId, `${emailId}_SI.txt`), contentType: "text/plain", bytes: 600, sha256: "0".repeat(64),
    });
    const file = (await attachments.listForEmail(tx, run.id, emailId))[0];
    await documents.upsert(tx, {
      emailRunId, attachmentId: file.id, role: "SI", format: "txt", textObjectKey: keys.text(run.id, emailId, `${emailId}_SI.txt`),
      pages: 1, scanned: false, unreadable: false, warnings: [], pageConfidence: [],
    });
    const doc = (await documents.listForEmailRun(tx, emailRunId))[0];
    await extractions.replace(tx, {
      documentId: doc.id, emailRunId, role: "SI", promptVersion: "v1", model: "sonnet", verified: false,
      fields: fieldsOf(shipment), evidenceOk: ALL_FOUND,
    });
  }

  // The resolver as production runs it, over whatever this transaction can see.
  const [mentions, verdicts] = await Promise.all([entities.loadMentions(tx), entities.loadVerdicts(tx)]);
  await entities.replaceAll(tx, resolveEntities(mentions, verdicts));

  const { rows } = await tx.query<{ id: string; canonical: string }>("select id::text as id, canonical from core.entities");
  const ids = new Map(rows.map((row) => [row.canonical, row.id]));
  return {
    runId: run.id,
    emailIds,
    idOf(canonical) {
      const id = ids.get(canonical);
      if (!id) throw new Error(`the seed resolved no thing called ${canonical}`);
      return id;
    },
  };
}
