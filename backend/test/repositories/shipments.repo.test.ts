import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { shipments, shipmentsRead } from "../../src/ontology/repositories";
import { inRollback, seedEmail } from "../db";

/**
 * The grouping itself is pure and tested in
 * test/pipeline/ontology-shipment-group.test.ts. This is about what the two
 * tables do with it: that a group keeps its id when its membership has not
 * changed, and that one that no longer exists is removed rather than left
 * behind as a shipment nothing is about.
 */

interface Refs {
  oc_no?: string | null;
  bl_no?: string | null;
  booking_ref?: string | null;
}

async function state(tx: PoolClient, emailId: string, refs: Refs): Promise<void> {
  await tx.query(
    `insert into core.email_shipments (email_id, oc_no, bl_no, booking_ref)
     values ($1, $2, $3, $4)
     on conflict (email_id) do update set oc_no = excluded.oc_no, bl_no = excluded.bl_no,
       booking_ref = excluded.booking_ref`,
    [emailId, refs.oc_no ?? null, refs.bl_no ?? null, refs.booking_ref ?? null],
  );
}

describe("regroupAll", () => {
  it("puts two emails sharing a bill number into one shipment", async () => {
    await inRollback(async (tx) => {
      const first = await seedEmail(tx);
      const second = await seedEmail(tx);
      await state(tx, first, { bl_no: "SIJ4216073" });
      await state(tx, second, { bl_no: "SIJ4216073" });

      const result = await shipments.regroupAll(tx);
      expect(result).toEqual({ shipments: 1, emails: 2 });

      const { shipments: rows } = await shipmentsRead.list(tx);
      expect(rows).toHaveLength(1);
      expect(rows[0].emails).toBe(2);
      expect(rows[0].refs).toEqual([{ key: "bl_no", label: "bill of lading", value: "SIJ4216073" }]);
    });
  });

  it("keeps a shipment's id across a regroup that did not change its membership", async () => {
    await inRollback(async (tx) => {
      const emailId = await seedEmail(tx);
      await state(tx, emailId, { oc_no: "5RAE-00543" });

      await shipments.regroupAll(tx);
      const before = (await shipmentsRead.list(tx)).shipments[0].id;
      await shipments.regroupAll(tx);
      const after = (await shipmentsRead.list(tx)).shipments[0].id;

      expect(after).toBe(before);
    });
  });

  it("splits a group when an email is read again and its reference changes, and drops the old one", async () => {
    await inRollback(async (tx) => {
      const first = await seedEmail(tx);
      const second = await seedEmail(tx);
      await state(tx, first, { oc_no: "5RAE-00543" });
      await state(tx, second, { oc_no: "5RAE-00543" });
      await shipments.regroupAll(tx);
      expect((await shipmentsRead.list(tx)).total).toBe(1);

      await state(tx, second, { oc_no: "5RCY-60883" });
      await shipments.regroupAll(tx);

      const { shipments: rows, total } = await shipmentsRead.list(tx);
      expect(total).toBe(2);
      expect(rows.every((row) => row.emails === 1)).toBe(true);
    });
  });

  it("opens into the emails it was read from", async () => {
    await inRollback(async (tx) => {
      const emailId = await seedEmail(tx);
      await state(tx, emailId, { booking_ref: "SIJ3754330" });
      await shipments.regroupAll(tx);

      const [row] = (await shipmentsRead.list(tx)).shipments;
      const detail = await shipmentsRead.find(tx, row.id);
      expect(detail?.statements.map((one) => one.emailId)).toEqual([emailId]);
      expect(detail?.row.refs[0].label).toBe("booking");
    });
  });

  it("answers null for a shipment that does not exist", async () => {
    await inRollback(async (tx) => {
      expect(await shipmentsRead.find(tx, "999999999")).toBeNull();
    });
  });
});
