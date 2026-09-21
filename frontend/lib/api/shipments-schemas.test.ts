import { describe, expect, it } from "vitest";

import { EntityRow } from "./ontology-schemas";
import { ShipmentRow } from "./shipments-schemas";

describe("mirrored contracts", () => {
  it("reads a shipment row with a null party", () => {
    const row = ShipmentRow.parse({
      emailId: "email_001", subject: "s", runId: null, outcome: null, ocNo: "OC1", blNo: null, bookingRef: null, mailDate: "2026-03-01",
      shipper: { id: "1", name: "ACME" }, consignee: null, notifyParty: null, pol: null, pod: null, carrier: null, vessel: null, commodity: null,
      voyage: null, containerCount: 2, containerType: "40HC", grossWeightKg: 41000, disputedFields: [],
    });
    expect(row.shipper?.name).toBe("ACME");
  });

  it("reads an entity row stored before phase 13", () => {
    const row = EntityRow.parse({ id: "1", type: "port", name: "P", mentions: 1, sightings: 0, emails: 1, names: 1, lastSeen: null });
    expect(row.attributes).toEqual({});
    expect(row.roles).toEqual({});
    expect(row.summary).toBeNull();
  });
});
