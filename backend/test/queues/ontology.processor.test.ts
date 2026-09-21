import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import type { LlmRequest } from "../../src/agents/llm-client";
import { classifications, documents, emailRuns, entityResolution, extractions } from "../../src/ontology/repositories";
import { processOntology } from "../../src/queues/processors/ontology.processor";
import { keys } from "../../src/storage";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { inRollback } from "../db";
import { classified } from "./compare.harness";

/**
 * The semantic reading end to end with a scripted model. What is on trial is
 * everything between the reading and the rows: the evidence check, the
 * extractor's precedence, and which spellings cost a model call.
 */

const SI_TEXT = [
  "SHIPPING INSTRUCTION",
  "CONSIGNEE: MOORIM SP CO., LTD",
  "Discharge Port: CALLAO, PERU (PECLL)",
  "Vessel Name: MMSS 2507 V.257087E",
  "OC No.: 5RSG-00133",
  "",
].join("\n");

const BODY = "Attached are the SI and draft BL for OC 5RSG-00133. Willy Situmorang signed it.";

/** What `shipment-read` answers, with only the fields a case needs set. */
function reading(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    references: { oc_no: { value: "5RSG-00133", source_quote: "OC No.: 5RSG-00133", source: "document" }, bl_no: null, booking_ref: null, invoice_no: null, po_no: null },
    parties: [],
    ports: { port_of_loading: null, port_of_discharge: null },
    carrier: null,
    vessel: { value: "MMSS 2507 V.257087E", source_quote: "Vessel Name: MMSS 2507 V.257087E", source: "document" },
    voyage: null, goods: null, hs_code: null,
    container_count: null, container_type: null, gross_weight_kg: null,
    trade_term: null, payment_term: null, bl_type: null, freight: null,
    mail_date: null,
    people: [{ sighting: "signer", name: "Willy Situmorang", email: null, company: null, title: null, source_quote: "Willy Situmorang signed it.", source: "body" }],
    ...over,
  });
}

/** The processor's seams, with the test's own transaction standing in for a real one. */
const deps = (tx: PoolClient, llm: FakeLlmClient, store: MemoryStore) => ({
  pool: tx,
  llm,
  store,
  tx: <T,>(fn: (inner: PoolClient) => Promise<T>) => fn(tx),
});

const resolved = (sameAs: string | null) =>
  JSON.stringify({ rationale: "nothing like it", sameAs, ambiguous: false, confidence: 0.9 });

/** Answers `shipment-read` with the scripted reading and every `entity-resolve` with `judge`, which says "it is new" unless told otherwise. */
function scripted(shipment: string, judge: (request: LlmRequest) => string = () => resolved(null)): (request: LlmRequest) => string {
  return (request) => (request.system.includes("You read what one email states") ? shipment : judge(request));
}

/** An email past its comparison, with one readable SI document and its extracted fields. */
async function readEmail(tx: PoolClient, store: MemoryStore) {
  const { runId, emailId, emailRunId } = await classified(tx, [{ filename: "e_SI.txt", role: "SI" }]);
  // seedEmail already inserted the row and emails.upsert does nothing on a
  // conflict, so the subject and body this test reads are set here.
  await tx.query("update core.emails set subject = $2, body = $3 where email_id = $1", [emailId, "TO CONFIRM DOCS _ 5RSG-00133", BODY]);
  const textKey = keys.text(runId, emailId, "e_SI.txt");
  await store.put(textKey, Buffer.from(SI_TEXT, "utf8"), "text/plain");
  const attachmentId = (await tx.query<{ id: string }>("select id::text as id from core.attachments where email_id = $1", [emailId])).rows[0].id;
  await documents.upsert(tx, {
    emailRunId, attachmentId, role: "SI", format: "txt", textObjectKey: textKey,
    pages: 1, scanned: false, unreadable: false, warnings: [], pageConfidence: [],
  });
  await emailRuns.setStage(tx, runId, emailId, "done");
  return { runId, emailId, emailRunId };
}

async function bodyOnlyShippingInstruction(tx: PoolClient) {
  const { runId, emailId, emailRunId } = await classified(tx, []);
  const subject = "RE_ CUST SI _ MEA _ 5RFR-64842 _ PO_25_3650";
  const body = [
    "Please find Shipping instruction for 5RFR-64842.",
    "POL: RUGAO/NANTONG/SHANGHAI, CHINA",
    "POD: AQABA, JORDAN",
    "Shipper:",
    "APRIL FAR EAST (M) SDN BHD",
    "Consignee:",
    "BALL & DOGGETT AUSTRALIA PTY LTD",
    "Notify Party:",
    "CERIX",
    "Description of Goods:",
    "5X40'HC",
    "UNCOATED WOODFREE PAPER IN REAMS",
    "H.S.CODE: 48025700",
    "GROSS WT: 115,065 KG",
    "Shipping line: LC TERM",
  ].join("\n");
  await tx.query("update core.emails set subject = $2, body = $3 where email_id = $1", [emailId, subject, body]);
  await classifications.upsert(tx, {
    emailRunId,
    genCategory: "SI_REQUEST",
    genConfidence: 0.98,
    verCategory: null,
    verConfidence: null,
    finalCategory: "SI_REQUEST",
    decidedBy: "llm",
    rationale: { generator: "The body is the shipping instruction." },
    model: "sonnet",
    promptVersion: "v6",
  });
  await emailRuns.setStage(tx, runId, emailId, "done");
  return { runId, emailId, emailRunId, subject, body };
}

const FIELD = { value: null, placeholder: null, source_quote: null, confidence: 0.9, note: null };

async function storeFields(tx: PoolClient, emailRunId: string, values: Partial<Record<string, string>>): Promise<void> {
  const documentId = (await documents.listForEmailRun(tx, emailRunId))[0].id;
  const fields = Object.fromEntries(
    ["shipper", "consignee", "notify_party", "port_of_loading", "port_of_discharge", "container_count", "gross_weight_kg"].map((field) => [
      field,
      values[field] === undefined ? FIELD : { ...FIELD, value: values[field], source_quote: `x: ${values[field]}` },
    ]),
  );
  await extractions.replace(tx, {
    documentId, emailRunId, role: "SI", promptVersion: "v1", model: "sonnet", verified: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the seven fields are built above by name.
    fields: fields as any,
    evidenceOk: Object.fromEntries(Object.keys(fields).map((field) => [field, true])) as never,
  });
}

async function rows(tx: PoolClient, emailId: string) {
  const sightings = await tx.query<{ role: string; surface: string; source: string; ambiguous: boolean }>(
    "select role, surface, source, ambiguous from core.entity_sightings where email_id = $1 order by role",
    [emailId],
  );
  const shipment = await tx.query("select * from core.email_shipments where email_id = $1", [emailId]);
  return { sightings: sightings.rows, shipment: shipment.rows[0] };
}

describe("the ontology processor", () => {
  it("writes shipment facts carried only in an SI email body", async () => {
    await inRollback(async (tx) => {
      const store = new MemoryStore();
      const { emailId, emailRunId } = await bodyOnlyShippingInstruction(tx);
      const llm = new FakeLlmClient(
        scripted(
          reading({
            references: {
              oc_no: { value: "5RFR-64842", source_quote: "Please find Shipping instruction for 5RFR-64842.", source: "body" },
              bl_no: null,
              booking_ref: null,
              invoice_no: null,
              po_no: { value: "PO_25_3650", source_quote: "RE_ CUST SI _ MEA _ 5RFR-64842 _ PO_25_3650", source: "subject" },
            },
            parties: [
              { role: "shipper", name: "APRIL FAR EAST (M) SDN BHD", address: null, source_quote: "APRIL FAR EAST (M) SDN BHD", source: "body" },
              { role: "consignee", name: "BALL & DOGGETT AUSTRALIA PTY LTD", address: null, source_quote: "BALL & DOGGETT AUSTRALIA PTY LTD", source: "body" },
              { role: "notify_party", name: "CERIX", address: null, source_quote: "CERIX", source: "body" },
            ],
            ports: {
              port_of_loading: { value: "RUGAO/NANTONG/SHANGHAI, CHINA", source_quote: "POL: RUGAO/NANTONG/SHANGHAI, CHINA", source: "body" },
              port_of_discharge: { value: "AQABA, JORDAN", source_quote: "POD: AQABA, JORDAN", source: "body" },
            },
            goods: { value: "UNCOATED WOODFREE PAPER IN REAMS", source_quote: "UNCOATED WOODFREE PAPER IN REAMS", source: "body" },
            hs_code: { value: "48025700", source_quote: "H.S.CODE: 48025700", source: "body" },
            container_count: { value: 5, source_quote: "5X40'HC", source: "body" },
            container_type: { value: "40'HC", source_quote: "5X40'HC", source: "body" },
            gross_weight_kg: { value: 115065, source_quote: "GROSS WT: 115,065 KG", source: "body" },
            trade_term: { value: "LC TERM", source_quote: "Shipping line: LC TERM", source: "body" },
          }),
        ),
      );

      await processOntology(deps(tx, llm, store), { emailId, emailRunId: Number(emailRunId) });

      expect(llm.requests[0].user).toContain("Read everything the email and its documents state.");
      const { shipment } = await rows(tx, emailId);
      expect(shipment).toMatchObject({
        oc_no: "5RFR-64842",
        po_no: "PO_25_3650",
        hs_code: "48025700",
        container_count: 5,
        container_type: "40'HC",
        gross_weight_kg: "115065",
        trade_term: "LC TERM",
      });
      expect(shipment.shipper_id).not.toBeNull();
      expect(shipment.consignee_id).not.toBeNull();
      expect(shipment.notify_party_id).not.toBeNull();
      expect(shipment.pol_id).not.toBeNull();
      expect(shipment.pod_id).not.toBeNull();
      expect(shipment.commodity_id).not.toBeNull();
    });
  });

  it("writes a shipment and the sightings nothing else holds", async () => {
    await inRollback(async (tx) => {
      const store = new MemoryStore();
      const { emailId, emailRunId } = await readEmail(tx, store);
      const llm = new FakeLlmClient(scripted(reading()));

      await processOntology(deps(tx, llm, store), { emailId, emailRunId: Number(emailRunId) });

      const { sightings, shipment } = await rows(tx, emailId);
      expect(shipment.oc_no).toBe("5RSG-00133");
      expect(sightings.map((one) => [one.role, one.surface])).toEqual([
        ["signer", "Willy Situmorang"],
        ["vessel", "MMSS 2507 V.257087E"],
      ]);
      expect(shipment.vessel_id).not.toBeNull();
    });
  });

  it("drops the one value whose quote is not in the text and writes the rest", async () => {
    await inRollback(async (tx) => {
      const store = new MemoryStore();
      const { emailId, emailRunId } = await readEmail(tx, store);
      const llm = new FakeLlmClient(
        scripted(reading({ hs_code: { value: "48025600", source_quote: "HS Code: not on this paper", source: "document" } })),
      );

      await processOntology(deps(tx, llm, store), { emailId, emailRunId: Number(emailRunId) });

      const { shipment } = await rows(tx, emailId);
      expect(shipment.hs_code).toBeNull();
      expect(shipment.oc_no).toBe("5RSG-00133");
    });
  });

  it("takes the extractor's value, and its reviewer's correction, over its own reading", async () => {
    await inRollback(async (tx) => {
      const store = new MemoryStore();
      const { emailId, emailRunId } = await readEmail(tx, store);
      await storeFields(tx, emailRunId, { consignee: "MOORIM SP CO., LTD", port_of_discharge: "CALLAO, PERU (PECLL)" });
      const llm = new FakeLlmClient(
        scripted(
          reading({
            parties: [{ role: "consignee", name: "SOMETHING ELSE LTD", address: null, source_quote: "CONSIGNEE: MOORIM SP CO., LTD", source: "document" }],
          }),
        ),
      );

      await processOntology(deps(tx, llm, store), { emailId, emailRunId: Number(emailRunId) });

      const { shipment, sightings } = await rows(tx, emailId);
      const consignee = await tx.query<{ canonical: string }>("select canonical from core.entities where id = $1", [shipment.consignee_id]);
      expect(consignee.rows[0].canonical).toBe("MOORIM SP CO., LTD");
      // Read off a document, a consignee is already a mention: it is not sighted twice.
      expect(sightings.map((one) => one.role)).not.toContain("consignee");
    });
  });

  it("replaces one email's rows on a second reading and leaves it with one shipment", async () => {
    await inRollback(async (tx) => {
      const store = new MemoryStore();
      const { emailId, emailRunId } = await readEmail(tx, store);
      const job = { emailId, emailRunId: Number(emailRunId) };

      await processOntology(deps(tx, new FakeLlmClient(scripted(reading())), store), job);
      const first = await rows(tx, emailId);
      // A retry reuses the stored reading, which the next case covers. Here the
      // email is genuinely read again, as it is after a reviewer's correction.
      await tx.query("delete from core.llm_calls where email_run_id = $1::bigint and step = 'shipment-read'", [emailRunId]);
      // The second reading names two things fewer, so the first reading's rows must go.
      await processOntology(
        deps(tx, new FakeLlmClient(scripted(reading({ vessel: null, people: [] }))), store),
        job,
      );
      const second = await rows(tx, emailId);

      expect(first.sightings).toHaveLength(2);
      expect(second.sightings).toHaveLength(0);
      expect(second.shipment.vessel_id).toBeNull();
      const count = await tx.query<{ n: string }>("select count(*)::text as n from core.email_shipments where email_id = $1", [emailId]);
      expect(count.rows[0].n).toBe("1");
    });
  });

  it("spends no model call on a spelling a thing already holds", async () => {
    await inRollback(async (tx) => {
      const store = new MemoryStore();
      const { emailId, emailRunId } = await readEmail(tx, store);
      const job = { emailId, emailRunId: Number(emailRunId) };

      const first = new FakeLlmClient(scripted(reading()));
      await processOntology(deps(tx, first, store), job);
      // Nothing is near either spelling, so neither needs a judge: only the reading itself is paid for.
      expect(first.requests).toHaveLength(1);

      const again = new FakeLlmClient(scripted(reading()));
      await processOntology(deps(tx, again, store), job);
      // The reading is reused from the stored call, and both spellings are now held.
      expect(again.requests).toHaveLength(0);
    });
  });

  it("asks a judge about a spelling with something near it, and shows it what is near", async () => {
    await inRollback(async (tx) => {
      const store = new MemoryStore();
      const { emailId, emailRunId } = await readEmail(tx, store);
      const nearby = await entityResolution.insertFromSighting(tx, "vessel", "MMSS 2507 V.257087", new Date());
      const llm = new FakeLlmClient(
        scripted(reading(), (request) => resolved(request.user.includes(`[${nearby}]`) ? String(nearby) : null)),
      );

      await processOntology(deps(tx, llm, store), { emailId, emailRunId: Number(emailRunId) });

      const asked = llm.requests.filter((request) => request.system.includes("You decide whether a name"));
      expect(asked).toHaveLength(1);
      const { shipment } = await rows(tx, emailId);
      expect(shipment.vessel_id).toBe(String(nearby));
    });
  });
});

/**
 * Two readings at once. Each judges against what was committed when it began, so
 * one that meets a thing for the first time cannot know another is about to
 * create it. `raced` runs a competing write in the gap between this reading's
 * judgement and its commit, which is exactly where it would land.
 */
describe("the ontology processor when another reading commits first", () => {
  /** A `tx` seam that lets `competitor` commit once, just before this reading's first write transaction. */
  const raced = (tx: PoolClient, competitor: () => Promise<unknown>) => {
    let injected = false;
    return async <T,>(fn: (inner: PoolClient) => Promise<T>): Promise<T> => {
      if (!injected) {
        injected = true;
        await competitor();
      }
      return fn(tx);
    };
  };

  it("joins a near spelling the other reading created, instead of making a second thing", async () => {
    await inRollback(async (tx) => {
      const store = new MemoryStore();
      const { emailId, emailRunId } = await readEmail(tx, store);
      let rival = 0;
      const llm = new FakeLlmClient(
        scripted(reading(), (request) => resolved(request.user.includes(`[${rival}]`) ? String(rival) : null)),
      );
      const job = { emailId, emailRunId: Number(emailRunId) };
      const withRace = { ...deps(tx, llm, store), tx: raced(tx, async () => { rival = await entityResolution.insertFromSighting(tx, "vessel", "MMSS 2507 V.257087", new Date()); }) };

      await processOntology(withRace, job);

      const vessels = await tx.query<{ id: string }>("select id::text as id from core.entities where kind = 'vessel' and merged_into is null");
      expect(vessels.rows.map((row) => row.id)).toEqual([String(rival)]);
      // The signer was judged once, before the race, and stood. The vessel was judged again, once.
      expect(llm.requests.filter((request) => request.system.includes("You decide whether a name"))).toHaveLength(1);
      const { shipment } = await rows(tx, emailId);
      expect(shipment.vessel_id).toBe(String(rival));
    });
  });

  it("uses the thing the other reading created when it holds this exact spelling, with no judge at all", async () => {
    await inRollback(async (tx) => {
      const store = new MemoryStore();
      const { emailId, emailRunId } = await readEmail(tx, store);
      let rival = 0;
      const llm = new FakeLlmClient(scripted(reading()));
      const withRace = { ...deps(tx, llm, store), tx: raced(tx, async () => { rival = await entityResolution.insertFromSighting(tx, "vessel", "MMSS 2507 V.257087E", new Date()); }) };

      await processOntology(withRace, { emailId, emailRunId: Number(emailRunId) });

      const vessels = await tx.query<{ id: string }>("select id::text as id from core.entities where kind = 'vessel' and merged_into is null");
      expect(vessels.rows.map((row) => row.id)).toEqual([String(rival)]);
      expect(llm.requests).toHaveLength(1);
    });
  });

  it("commits at once, in one round, when nothing near its spellings changed", async () => {
    await inRollback(async (tx) => {
      const store = new MemoryStore();
      const { emailId, emailRunId } = await readEmail(tx, store);
      const llm = new FakeLlmClient(scripted(reading()));
      // A competing write of a different kind of thing moves nothing this reading was shown.
      const withRace = { ...deps(tx, llm, store), tx: raced(tx, async () => { await entityResolution.insertFromSighting(tx, "port", "ROTTERDAM, NETHERLANDS", new Date()); }) };

      await processOntology(withRace, { emailId, emailRunId: Number(emailRunId) });

      expect(llm.requests).toHaveLength(1);
      const vessels = await tx.query("select 1 from core.entities where kind = 'vessel' and merged_into is null");
      expect(vessels.rowCount).toBe(1);
    });
  });
});
