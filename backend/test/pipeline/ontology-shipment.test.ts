import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { assembleShipment, type ShipmentReading, type ShipmentSources } from "../../src/pipeline/ontology";

/**
 * The texts are real lines from email_001 and email_007. Two rules are on
 * trial in every case: a quote that is not in the text drops that value and
 * nothing else, and what the extractor already settled wins over this reading.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(HERE, "../fixtures/ontology", name), "utf8");

const SI_REQUEST: ShipmentSources = {
  subject: fixture("email_007_subject.txt"),
  body: fixture("email_007_body.txt"),
  documents: [],
};
const WITH_DOCUMENT: ShipmentSources = {
  subject: fixture("email_001_subject.txt"),
  body: "Attached are the SI and draft BL for OC 5RSG-00133 (PAPERONE DIGITAL COPIER PAPER). Please check the details and confirm.",
  documents: [fixture("email_001_SI.txt")],
};

const NOTHING: ShipmentReading = {
  references: { oc_no: null, bl_no: null, booking_ref: null, invoice_no: null, po_no: null },
  parties: [],
  ports: { port_of_loading: null, port_of_discharge: null },
  carrier: null, vessel: null, voyage: null, goods: null, hs_code: null,
  container_count: null, container_type: null, gross_weight_kg: null,
  trade_term: null, payment_term: null, bl_type: null, freight: null,
  mail_date: null, people: [],
};

const body = (value: string, quote: string) => ({ value, source_quote: quote, source: "body" as const });
const subject = (value: string, quote: string) => ({ value, source_quote: quote, source: "subject" as const });
const document = (value: string, quote: string) => ({ value, source_quote: quote, source: "document" as const });

describe("assembling one email's shipment", () => {
  it("reads a request written as prose, with no attachment at all", () => {
    const { shipment, sightings, dropped } = assembleShipment(
      {
        ...NOTHING,
        references: { ...NOTHING.references, oc_no: subject("5RFR-37631", "REQUEST SI _ 5RFR-37631 _ GDANSK_POLAND") },
        parties: [
          { role: "shipper", name: "APRIL FINE PAPER TRADING", address: null, source_quote: "APRIL FINE PAPER TRADING", source: "body" },
          { role: "on_behalf_of", name: "VITAL SOLUTIONS PTE LTD", address: "77 ROBINSON ROAD, #21-01", source_quote: "ON BEHALF OF VITAL SOLUTIONS PTE LTD", source: "body" },
          { role: "consignee", name: "AL GURG STATIONERY LLC", address: "P.O. BOX 5069", source_quote: "AL GURG STATIONERY LLC", source: "body" },
          { role: "notify_party", name: "PACIFIC OFFICE (M) SDN BHD", address: "LOT 6, JALAN P/7", source_quote: "PACIFIC OFFICE (M) SDN BHD", source: "body" },
        ],
        ports: { port_of_loading: body("SINGAPORE", "POL: SINGAPORE"), port_of_discharge: body("GDANSK, POLAND", "POD: GDANSK, POLAND") },
        goods: body("PAPERBOARD", "PAPERBOARD"),
        hs_code: body("48109200", "H.S.CODE: 48109200"),
        gross_weight_kg: { value: 354_765, source_quote: "GROSS WT: 354,765 KG", source: "body" },
      },
      SI_REQUEST,
      [],
    );

    expect(dropped).toEqual([]);
    expect(shipment.ocNo).toBe("5RFR-37631");
    expect(shipment.hsCode).toBe("48109200");
    expect(shipment.attributes).toEqual({ goods: "PAPERBOARD" });
    // The four parties and both ports are sighted with the addresses the body
    // carried, because no extraction reaches into a body.
    expect(sightings.filter((one) => one.role.endsWith("_party") || one.role === "shipper" || one.role === "consignee" || one.role === "on_behalf_of")).toHaveLength(4);
    expect(sightings.find((one) => one.role === "on_behalf_of")).toMatchObject({ surface: "VITAL SOLUTIONS PTE LTD", address: "77 ROBINSON ROAD, #21-01" });
    expect(shipment.links.map((link) => link.column).sort()).toEqual(["commodity_id", "consignee_id", "notify_party_id", "pod_id", "pol_id", "shipper_id"]);
  });

  it("drops the one value whose quote is not in the text, and keeps the rest", () => {
    const { shipment, dropped } = assembleShipment(
      {
        ...NOTHING,
        references: {
          ...NOTHING.references,
          oc_no: document("5RSG-00133", "OC No.: 5RSG-00133"),
          booking_ref: document("MSDUL0942518196", "Booking Ref: NOT WHAT THE PAPER SAYS"),
        },
        vessel: document("MMSS 2507 V.257087E", "Vessel Name: MMSS 2507 V.257087E"),
      },
      WITH_DOCUMENT,
      [],
    );

    expect(shipment.ocNo).toBe("5RSG-00133");
    expect(shipment.bookingRef).toBeNull();
    expect(dropped).toEqual([{ what: "booking_ref", reason: "quote_not_found" }]);
  });

  it("reports a value read twice, as a sighting and as a column, as one loss", () => {
    const { dropped, shipment, sightings } = assembleShipment(
      { ...NOTHING, goods: document("PAPERBOARD", "Description of Goods: PAPERBOARD") },
      WITH_DOCUMENT,
      [],
    );
    expect(dropped).toEqual([{ what: "goods", reason: "quote_not_found" }]);
    expect(shipment.attributes).toEqual({});
    expect(sightings).toEqual([]);
  });

  it("drops a value the quoted line does not contain", () => {
    const { shipment, dropped } = assembleShipment(
      { ...NOTHING, hs_code: document("99999999", "HS Code: 48025600") },
      WITH_DOCUMENT,
      [],
    );
    expect(shipment.hsCode).toBeNull();
    expect(dropped).toEqual([{ what: "hs_code", reason: "value_not_in_quote" }]);
  });

  it("does not sight again what the extractor already read off a document", () => {
    const { sightings, shipment } = assembleShipment(
      {
        ...NOTHING,
        parties: [{ role: "consignee", name: "MOORIM SP CO., LTD", address: null, source_quote: "CONSIGNEE: MOORIM SP CO., LTD", source: "document" }],
        ports: { port_of_loading: null, port_of_discharge: document("CALLAO, PERU (PECLL)", "Discharge Port: CALLAO, PERU (PECLL)") },
        vessel: document("MMSS 2507 V.257087E", "Vessel Name: MMSS 2507 V.257087E"),
      },
      WITH_DOCUMENT,
      [{ field: "consignee", value: "MOORIM SP CO., LTD", disputed: false }],
    );

    // The consignee and the discharge port are mentions already. The vessel is
    // nobody else's, so it is a sighting.
    expect(sightings.map((one) => one.role)).toEqual(["vessel"]);
    expect(shipment.links.find((link) => link.column === "consignee_id")?.surface).toBe("MOORIM SP CO., LTD");
  });

  it("takes the settled value over its own reading, and names the field the judge called different", () => {
    const { shipment } = assembleShipment(
      {
        ...NOTHING,
        ports: { port_of_loading: null, port_of_discharge: document("BUSAN, SOUTH KOREA", "Discharge Port: CALLAO, PERU (PECLL)") },
      },
      WITH_DOCUMENT,
      [
        { field: "port_of_discharge", value: "CALLAO, PERU (PECLL)", disputed: true },
        { field: "consignee", value: "MOORIM SP CO., LTD", disputed: false },
      ],
    );

    expect(shipment.links.find((link) => link.column === "pod_id")?.surface).toBe("CALLAO, PERU (PECLL)");
    expect(shipment.disputedFields).toEqual(["port_of_discharge"]);
  });

  it("links every party the extractor settled, whether or not this reading repeated it", () => {
    // The reader is told not to repeat the four parties, so most readings list
    // none. The link has to come from the settled value on its own.
    const { shipment } = assembleShipment(
      { ...NOTHING, parties: [{ role: "on_behalf_of", name: "VITAL SOLUTIONS PTE LTD", address: null, source_quote: "ON BEHALF OF VITAL SOLUTIONS PTE LTD", source: "body" }] },
      SI_REQUEST,
      [
        { field: "shipper", value: "APRIL FINE PAPER TRADING", disputed: false },
        { field: "consignee", value: "AL GURG STATIONERY LLC", disputed: false },
        { field: "notify_party", value: "PACIFIC OFFICE (M) SDN BHD", disputed: true },
      ],
    );

    expect(shipment.links).toEqual([
      { column: "shipper_id", surface: "APRIL FINE PAPER TRADING" },
      { column: "consignee_id", surface: "AL GURG STATIONERY LLC" },
      { column: "notify_party_id", surface: "PACIFIC OFFICE (M) SDN BHD" },
    ]);
    expect(shipment.disputedFields).toEqual(["notify_party"]);
  });

  it("prefers a settled count that is a number and falls back where it is not", () => {
    const reading = { ...NOTHING, container_count: { value: 9, source_quote: "No. of Containers or Packages: 1 x 40'HC", source: "document" as const } };
    const written = assembleShipment(reading, WITH_DOCUMENT, [{ field: "container_count", value: "1 x 40'HC", disputed: false }]);
    expect(written.shipment.containerCount).toBe(9);

    const plain = assembleShipment(reading, WITH_DOCUMENT, [{ field: "container_count", value: "1", disputed: false }]);
    expect(plain.shipment.containerCount).toBe(1);
  });

  it("reads a signer and a sender as two people and never as one", () => {
    const { sightings } = assembleShipment(
      {
        ...NOTHING,
        people: [
          { sighting: "signer", name: "Ooi Sok Yong", email: null, company: "APRIL Fine Paper Trading (Middle East) Fze", title: "Shipping Documentation", source_quote: "Ooi Sok Yong", source: "body" },
          { sighting: "addressee", name: "Willy", email: null, company: null, title: null, source_quote: "Hi Willy", source: "body" },
        ],
      },
      SI_REQUEST,
      [],
    );
    expect(sightings.map((one) => [one.role, one.surface])).toEqual([
      ["signer", "Ooi Sok Yong"],
      ["addressee", "Willy"],
    ]);
  });

  it("keeps a date the mail states and nothing where it states none", () => {
    const stated = assembleShipment(
      { ...NOTHING, mail_date: { value: "2026-01-28", source_quote: "REQUEST SI _ 5RFR-37631", source: "subject" } },
      SI_REQUEST,
      [],
    );
    expect(stated.shipment.mailDate).toBe("2026-01-28");
    expect(assembleShipment(NOTHING, SI_REQUEST, []).shipment.mailDate).toBeNull();
  });

  it("makes an empty shipment out of an email that states nothing", () => {
    const { shipment, sightings, dropped } = assembleShipment(NOTHING, SI_REQUEST, []);
    expect(sightings).toEqual([]);
    expect(dropped).toEqual([]);
    expect(shipment.links).toEqual([]);
    expect(shipment.attributes).toEqual({});
  });
});
