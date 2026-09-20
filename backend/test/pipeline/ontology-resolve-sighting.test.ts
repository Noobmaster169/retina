import { describe, expect, it } from "vitest";

import { type NameHit, planSighting } from "../../src/pipeline/ontology";

/**
 * The question this answers is not "which thing is it" but "has a judge
 * already answered". Anything less than one live thing holding the spelling
 * goes to the model.
 */

const hit = (entityId: number, value: string, kind: NameHit["kind"] = "party"): NameHit => ({ entityId, kind, value });

describe("planning one sighting", () => {
  it("reuses the thing whose stored spelling is exactly this one", () => {
    expect(planSighting("party", "UAB NOVAKOPA", [hit(4, "UAB NOVAKOPA"), hit(9, "NOVAKOPA UAB")])).toEqual({
      decision: "use",
      entityId: 4,
      how: "exact",
    });
  });

  it("reuses one that differs only in case", () => {
    expect(planSighting("party", "uab novakopa", [hit(4, "UAB NOVAKOPA")])).toEqual({
      decision: "use",
      entityId: 4,
      how: "same case",
    });
  });

  it("asks when nothing holds the spelling", () => {
    expect(planSighting("port", "MOMBASA_KENYA", [])).toEqual({ decision: "ask" });
  });

  it("asks when two things hold it, which is a real ambiguity and not a tie to break", () => {
    expect(planSighting("party", "SINGAPORE", [hit(1, "SINGAPORE"), hit(2, "SINGAPORE")])).toEqual({ decision: "ask" });
    expect(planSighting("party", "singapore", [hit(1, "SINGAPORE"), hit(2, "Singapore")])).toEqual({ decision: "ask" });
  });

  it("never reuses a thing of another kind spelt the same way", () => {
    expect(planSighting("port", "SINGAPORE", [hit(8, "SINGAPORE", "party")])).toEqual({ decision: "ask" });
  });

  it("takes an exact hit over a same-case one, whichever came back first", () => {
    expect(planSighting("port", "NANTONG", [hit(2, "nantong", "port"), hit(5, "NANTONG", "port"), hit(7, "Nantong", "port")])).toEqual({
      decision: "use",
      entityId: 5,
      how: "exact",
    });
  });

  it("reuses a thing that holds the spelling twice, which is one thing and not two", () => {
    expect(planSighting("person", "willy@example.com", [hit(3, "willy@example.com", "person"), hit(3, "willy@example.com", "person")])).toEqual({
      decision: "use",
      entityId: 3,
      how: "exact",
    });
  });
});
