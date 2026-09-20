import { describe, expect, it } from "vitest";

import { type Mention, resolveEntities, type Verdict } from "../../src/pipeline/ontology";

/**
 * The values are real lines from the dataset's Nantong cluster, which is the
 * one the design draws on DbRecord.dc.html. The point of every case below is
 * the same: a spelling joins a thing when the field judge said so and never
 * for any other reason.
 */

let nextId = 0;

function mention(field: Mention["field"], value: string, at: string, emailRunId = 1): Mention {
  nextId += 1;
  return { extractionFieldId: nextId, emailRunId, field, value, seenAt: new Date(at) };
}

function judged(field: Verdict["field"], siValue: string, blValue: string, confidence: number | null = 0.9): Verdict {
  return { field, siValue, blValue, same: true, confidence };
}

const MAR14 = "2026-03-14T08:12:00Z";
const MAR13 = "2026-03-13T17:22:00Z";

describe("resolveEntities", () => {
  it("keeps the spelling seen most often and joins the rest through the judge", () => {
    const mentions = [
      mention("port_of_loading", "NANTONG, CHINA", MAR13, 1),
      mention("port_of_loading", "NANTONG, CHINA", MAR14, 2),
      mention("port_of_loading", "NANTONG", MAR14, 3),
    ];
    const [entity] = resolveEntities(mentions, [judged("port_of_loading", "NANTONG, CHINA", "NANTONG", 0.97)]);

    expect(entity.kind).toBe("port");
    expect(entity.canonical).toBe("NANTONG, CHINA");
    expect(entity.names).toEqual([
      { value: "NANTONG, CHINA", seenCount: 2, joinedBy: "kept", confidence: null },
      { value: "NANTONG", seenCount: 1, joinedBy: "judge", confidence: 0.97 },
    ]);
    expect(entity.mentions).toHaveLength(3);
  });

  it("leaves two spellings the judge never compared as two things", () => {
    const entities = resolveEntities(
      [mention("port_of_discharge", "JEBEL ALI", MAR14), mention("port_of_discharge", "AEJEA", MAR14)],
      [],
    );
    expect(entities).toHaveLength(2);
    expect(entities.map((entity) => entity.canonical).sort()).toEqual(["AEJEA", "JEBEL ALI"]);
  });

  it("does not join a pair the judge called different", () => {
    const entities = resolveEntities(
      [mention("consignee", "AL GURG TRADING LLC", MAR14), mention("consignee", "SAFQA LIMITED", MAR14)],
      [{ field: "consignee", siValue: "AL GURG TRADING LLC", blValue: "SAFQA LIMITED", same: false, confidence: 0.99 }],
    );
    expect(entities).toHaveLength(2);
  });

  it("joins a chain: three spellings and two verdicts make one thing", () => {
    const entities = resolveEntities(
      [
        mention("port_of_loading", "NANTONG, CHINA", MAR13),
        mention("port_of_loading", "NANTONG, CHINA", MAR14),
        mention("port_of_loading", "NANTONG, CHINA (CNNTG)", MAR14),
        mention("port_of_loading", "NANTONG CHIMA", MAR14),
      ],
      [
        judged("port_of_loading", "NANTONG, CHINA", "NANTONG, CHINA (CNNTG)", 0.98),
        judged("port_of_loading", "NANTONG, CHINA (CNNTG)", "NANTONG CHIMA", 0.85),
      ],
    );
    expect(entities).toHaveLength(1);
    expect(entities[0].names).toHaveLength(3);
    // The OCR slip carries the confidence of the verdict that let it in, which
    // is what `written these ways` prints beside it.
    expect(entities[0].names.find((name) => name.value === "NANTONG CHIMA")?.confidence).toBe(0.85);
  });

  it("never merges a port and a party written the same way", () => {
    const entities = resolveEntities(
      [mention("port_of_loading", "NANTONG", MAR14), mention("shipper", "NANTONG", MAR14)],
      [],
    );
    expect(entities.map((entity) => entity.kind).sort()).toEqual(["party", "port"]);
  });

  it("ignores the fields that denote no thing", () => {
    expect(resolveEntities([mention("container_count", "2", MAR14), mention("gross_weight_kg", "138000", MAR14)], [])).toEqual([]);
  });

  it("skips a blank value rather than making a thing out of it", () => {
    expect(resolveEntities([mention("consignee", "   ", MAR14)], [])).toEqual([]);
  });

  it("ignores a verdict about a value no extraction stored", () => {
    const entities = resolveEntities(
      [mention("consignee", "AL GURG TRADING LLC", MAR14)],
      [judged("consignee", "AL GURG TRADING LLC", "AL GURG TRADING L.L.C.")],
    );
    expect(entities).toHaveLength(1);
    expect(entities[0].names).toHaveLength(1);
  });

  it("takes first and last seen from the mentions, across every spelling", () => {
    const [entity] = resolveEntities(
      [mention("port_of_loading", "NANTONG", MAR14), mention("port_of_loading", "NANTONG, CHINA", MAR13)],
      [judged("port_of_loading", "NANTONG", "NANTONG, CHINA")],
    );
    expect(entity.firstSeenAt.toISOString()).toBe(new Date(MAR13).toISOString());
    expect(entity.lastSeenAt.toISOString()).toBe(new Date(MAR14).toISOString());
  });

  it("breaks a tie on the spelling, so a rebuild always lands on the same canonical", () => {
    const [entity] = resolveEntities(
      [mention("consignee", "BRAVO LTD", MAR14), mention("consignee", "ALPHA LTD", MAR14)],
      [judged("consignee", "BRAVO LTD", "ALPHA LTD")],
    );
    expect(entity.canonical).toBe("ALPHA LTD");
  });

  it("is empty with nothing to resolve", () => {
    expect(resolveEntities([], [])).toEqual([]);
  });
});
