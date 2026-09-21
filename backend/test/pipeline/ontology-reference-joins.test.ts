import { describe, expect, it } from "vitest";

import { type Mention, referenceJoins, resolveEntities, type Sighting } from "../../src/pipeline/ontology";

/**
 * Every spelling below is one the live inbox produced for a port, bracketed
 * code included: the dataset writes a stale code on a document that names a
 * different port, so the code in the text is never what joins two spellings.
 * What joins them is the world's list placing both at the same UN/LOCODE.
 */

let nextId = 0;
function mention(field: Mention["field"], value: string): Mention {
  nextId += 1;
  return { extractionFieldId: nextId, emailRunId: nextId, field, value, seenAt: new Date("2026-03-14T08:12:00Z") };
}
const sighting = (kind: Sighting["kind"], value: string): Sighting => ({ kind, value, seenAt: new Date("2026-03-13T17:22:00Z") });

describe("referenceJoins", () => {
  it("joins every spelling the reference places at one code, whatever code the text wrote", () => {
    const joins = referenceJoins(
      [mention("port_of_loading", "FREMANTLE, AUSTRALIA"), mention("port_of_discharge", "FREMANTLE, AUSTRALIA (CLVAP)")],
      [sighting("port", "FREMANTLE, AUSTRALIA (AUFRE)")],
    );
    expect(joins).toHaveLength(2);
    for (const join of joins) {
      expect(join).toMatchObject({ kind: "port", same: true, confidence: null, step: "reference" });
    }
    const pairs = joins.map((join) => [join.siValue, join.blValue].sort().join(" = "));
    expect(new Set(pairs).size).toBe(2);
  });

  it.each([
    ["MOMBASA_KENYA", "MOMBASA, KENYA (AUBNE)"],
    ["NEW YORK_US", "NEW YORK, US (USNYC)"],
    ["GDANSK POLAND", "GDANSK, POLAND (PLGDN)"],
    ["SINGAPORE (SGSIN)", "SINGAPORE, SINGAPORE (MYPKG)"],
  ])("resolves %s and %s into one port", (a, b) => {
    const entities = resolveEntities(
      [mention("port_of_loading", a), mention("port_of_loading", b)],
      referenceJoins([mention("port_of_loading", a), mention("port_of_loading", b)], []),
    );
    expect(entities).toHaveLength(1);
    expect(entities[0].names.map((name) => name.joinedBy).sort()).toEqual(["kept", "reference"]);
  });

  it("leaves two ports of one country apart, and a spelling the reference cannot place alone", () => {
    const mentions = [
      mention("port_of_loading", "BRISBANE, AUSTRALIA (AUBNE)"),
      mention("port_of_loading", "FREMANTLE, AUSTRALIA"),
      mention("port_of_loading", "SOMEWHERE NOBODY KNOWS"),
    ];
    expect(referenceJoins(mentions, [])).toEqual([]);
    expect(resolveEntities(mentions, referenceJoins(mentions, []))).toHaveLength(3);
  });

  it("never joins a party, however its name reads", () => {
    expect(referenceJoins([mention("shipper", "SINGAPORE PAPER CO"), mention("consignee", "SINGAPORE (SGSIN)")], [])).toEqual([]);
  });
});
