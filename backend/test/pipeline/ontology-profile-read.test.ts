import { describe, expect, it } from "vitest";

import type { EntityProfile } from "../../src/contracts";
import { readProfile, renderProfile } from "../../src/pipeline/ontology";

/**
 * The reader is the renderer's inverse, so the test renders and reads back.
 * A change to either that the other does not follow fails here rather than on
 * a page that quietly shows no summary.
 */

const profile = (over: Partial<EntityProfile> = {}): EntityProfile => ({
  summary: "CMA is a carrier recorded under a single spelling. It appears twice.",
  observed: "CMA appears as carrier in 2 emails, both under the spelling CMA.",
  general: "CMA CGM is a French container line.",
  generalConfidence: 0.85,
  unknowns: ["No address has ever been written with this name."],
  ...over,
});

const render = (one: EntityProfile, attributes: Record<string, string | null> = { scac: "CMDU" }) =>
  renderProfile("carrier", "CMA", ["CMA"], one, attributes).markdown;

describe("readProfile", () => {
  it("reads back every part of a full profile", () => {
    const one = profile();
    const read = readProfile(render(one));
    expect(read.summary).toBe(one.summary);
    expect(read.observed).toBe(one.observed);
    expect(read.general).toEqual({ text: one.general, confidence: 0.85 });
    expect(read.unknowns).toEqual(one.unknowns);
  });

  it.each([
    ["no general knowledge, which is what a person always gets", profile({ general: null, generalConfidence: null })],
    ["nothing missing", profile({ unknowns: [] })],
    ["a summary of several lines", profile({ summary: "One sentence.\nAnd a second on its own line." })],
    ["several unknowns", profile({ unknowns: ["No address.", "One side of one shipment.", "Never says what they ship."] })],
  ])("round-trips %s", (_name, one) => {
    const read = readProfile(render(one));
    expect(read.summary).toBe(one.summary);
    expect(read.observed).toBe(one.observed);
    expect(read.unknowns).toEqual(one.unknowns);
    expect(read.general === null).toBe(one.general === null);
  });

  it("round-trips a profile with no attributes at all, which renders no What it is section", () => {
    const one = profile();
    const read = readProfile(render(one, { scac: null }));
    expect(read.summary).toBe(one.summary);
    expect(read.observed).toBe(one.observed);
  });

  it("answers empty for a thing that has never been profiled", () => {
    expect(readProfile(null)).toEqual({ summary: null, observed: null, general: null, unknowns: [] });
    expect(readProfile("   ")).toEqual({ summary: null, observed: null, general: null, unknowns: [] });
  });
});
