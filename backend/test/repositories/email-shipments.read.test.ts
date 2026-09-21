import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { emailShipments, shipmentRead } from "../../src/ontology/repositories";
import { ACME_ME, ALPHA, BETA, NORTHWIND, type SeededInbox, seedInbox } from "../chat-seed";
import { inRollback } from "../db";

/** Writes a shipment row for one seeded email, linked to the seed's resolved things. */
async function seedShipment(tx: PoolClient, inbox: SeededInbox, at: number, disputed: string[] = []): Promise<string> {
  const emailId = inbox.emailIds[at];
  const { rows } = await tx.query<{ id: string }>(
    "select id::text as id from core.email_runs where email_id = $1::text order by id desc limit 1",
    [emailId],
  );
  await emailShipments.replaceForEmail(tx, {
    emailId,
    emailRunId: Number(rows[0].id),
    draft: {
      ocNo: `OC-${at}`, blNo: `BL-${at}`, bookingRef: null, invoiceNo: null, poNo: null, voyage: "V01", hsCode: null,
      containerCount: 2, containerType: "40HC", grossWeightKg: 41000, tradeTerm: null, paymentTerm: null, blType: null,
      freight: null, mailDate: `2026-03-0${at + 1}`, mailDateQuote: null, disputedFields: disputed as never,
      attributes: { remark: "urgent" }, links: [],
    },
    links: {
      shipper_id: Number(inbox.idOf(ACME_ME)), consignee_id: Number(inbox.idOf(NORTHWIND)),
      pol_id: Number(inbox.idOf(ALPHA)), pod_id: Number(inbox.idOf(BETA)),
    },
  });
  return emailId;
}

describe("shipmentRead", () => {
  it("lists shipments with their parties and ports named, newest mail first", async () => {
    await inRollback(async (tx) => {
      const inbox = await seedInbox(tx);
      await seedShipment(tx, inbox, 0);
      const second = await seedShipment(tx, inbox, 1, ["port_of_discharge"]);
      const list = await shipmentRead.list(tx, { page: 1, pageSize: 50 });
      expect(list.total).toBe(2);
      expect(list.shipments[0].emailId).toBe(second);
      expect(list.shipments[0].shipper?.name).toBe(ACME_ME);
      expect(list.shipments[0].pod?.name).toBe(BETA);
      expect(list.shipments[0].disputedFields).toEqual(["port_of_discharge"]);
      expect(list.shipments[0].runId).toBe(inbox.runId);
      expect(list.shipments[0].mailDate).toBe("2026-03-02");
    });
  });

  it("filters by a party, a port, a dispute and a reference", async () => {
    await inRollback(async (tx) => {
      const inbox = await seedInbox(tx);
      await seedShipment(tx, inbox, 0);
      await seedShipment(tx, inbox, 1, ["consignee"]);
      expect((await shipmentRead.list(tx, { partyId: inbox.idOf(NORTHWIND), page: 1, pageSize: 50 })).total).toBe(2);
      expect((await shipmentRead.list(tx, { portId: inbox.idOf(ALPHA), page: 1, pageSize: 50 })).total).toBe(2);
      expect((await shipmentRead.list(tx, { disputed: "true", page: 1, pageSize: 50 })).total).toBe(1);
      expect((await shipmentRead.list(tx, { q: "OC-1", page: 1, pageSize: 50 })).total).toBe(1);
    });
  });

  it("opens one shipment with everything the mail stated", async () => {
    await inRollback(async (tx) => {
      const inbox = await seedInbox(tx);
      const emailId = await seedShipment(tx, inbox, 0);
      const detail = await shipmentRead.detail(tx, emailId);
      expect(detail?.attributes).toEqual({ remark: "urgent" });
      expect(detail?.caseHref).toBe(`/runs/${inbox.runId}/emails/${emailId}`);
      expect(await shipmentRead.detail(tx, "email_nobody")).toBeNull();
    });
  });
});
