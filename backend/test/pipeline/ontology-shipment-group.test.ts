import { describe, expect, it } from "vitest";

import { groupShipments, readRef, type ShipmentRead } from "../../src/pipeline/ontology";

/**
 * What makes two emails one consignment. The references are the shapes the
 * generator draws (`5RAE-00543`, `SIJ4216073`), and the cases are the ones a
 * real thread produces: an instruction and its draft sharing a booking, an
 * invoice query joined to both through the order number, and two emails that
 * look alike and share no number at all.
 */

const read = (emailId: string, refs: ShipmentRead["refs"] = {}): ShipmentRead => ({ emailId, refs });

const ids = (reads: ShipmentRead[]) => groupShipments(reads).map((group) => group.emailIds);

describe("groupShipments", () => {
  it("puts an email with no reference at all in a shipment of its own", () => {
    expect(ids([read("email_001"), read("email_002")])).toEqual([["email_001"], ["email_002"]]);
  });

  it("joins two emails that share one reference", () => {
    expect(
      ids([read("email_001", { bl_no: "SIJ4216073" }), read("email_002", { bl_no: "SIJ4216073" })]),
    ).toEqual([["email_001", "email_002"]]);
  });

  it("joins a chain: A and B share a booking, B and C share an order", () => {
    expect(
      ids([
        read("email_001", { booking_ref: "SIJ3754330" }),
        read("email_002", { booking_ref: "SIJ3754330", oc_no: "5RAE-00543" }),
        read("email_003", { oc_no: "5RAE-00543" }),
      ]),
    ).toEqual([["email_001", "email_002", "email_003"]]);
  });

  it("keeps two emails apart when the same number is a different kind of number", () => {
    expect(
      ids([read("email_001", { invoice_no: "5250071234" }), read("email_002", { oc_no: "5250071234" })]),
    ).toEqual([["email_001"], ["email_002"]]);
  });

  it("does not join on whitespace or a missing value", () => {
    expect(ids([read("email_001", { bl_no: "   " }), read("email_002", { bl_no: null })])).toEqual([
      ["email_001"],
      ["email_002"],
    ]);
  });

  it("keeps every reference the group carries, in the order a person reads them", () => {
    const [group] = groupShipments([
      read("email_002", { bl_no: "SIJ4216073", po_no: "PO-9" }),
      read("email_001", { bl_no: "SIJ4216073", oc_no: "5RAE-00543" }),
    ]);
    expect(group.refs).toEqual(["oc_no:5RAE-00543", "bl_no:SIJ4216073", "po_no:PO-9"]);
    expect(group.emailIds).toEqual(["email_001", "email_002"]);
  });

  it("does not depend on the order the emails were read in", () => {
    const forwards = groupShipments([
      read("email_001", { oc_no: "5RAE-00543" }),
      read("email_002", { oc_no: "5RAE-00543" }),
    ]);
    const backwards = groupShipments([
      read("email_002", { oc_no: "5RAE-00543" }),
      read("email_001", { oc_no: "5RAE-00543" }),
    ]);
    expect(forwards).toEqual(backwards);
  });

  it("is one group per email on the inbox as it stands, where no two share a number", () => {
    const reads = Array.from({ length: 25 }, (_, at) =>
      read(`email_${String(at + 1).padStart(3, "0")}`, { oc_no: `5RAE-0054${at}`, bl_no: `SIJ42160${at}` }),
    );
    expect(groupShipments(reads)).toHaveLength(25);
  });
});

describe("readRef", () => {
  it.each([
    ["oc_no:5RAE-00543", "order", "5RAE-00543"],
    ["bl_no:SIJ4216073", "bill of lading", "SIJ4216073"],
    ["booking_ref:SIJ3754330", "booking", "SIJ3754330"],
    ["invoice_no:5250071234", "invoice", "5250071234"],
    ["po_no:PO-9", "purchase order", "PO-9"],
  ])("reads %s as a kind and a number", (ref, label, value) => {
    expect(readRef(ref)).toMatchObject({ label, value });
  });

  it("keeps a value that itself contains a colon", () => {
    expect(readRef("oc_no:5RAE:00543").value).toBe("5RAE:00543");
  });
});
