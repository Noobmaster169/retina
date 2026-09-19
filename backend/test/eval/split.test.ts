import { describe, expect, it } from "vitest";

import type { TruthRow } from "../../src/contracts";
import { splitIds } from "../../src/eval/split";

function row(category: TruthRow["category"], extra: Partial<TruthRow> = {}): TruthRow {
  return { category, status: "OK", review_reason: null, has_defect: false, defect_fields: [], ...extra };
}

/** The shape of the real inbox, scaled down: big strata, small ones, and one of a single email. */
function truth(): Record<string, TruthRow> {
  const out: Record<string, TruthRow> = {};
  let n = 0;
  const add = (count: number, make: () => TruthRow) => {
    for (let i = 0; i < count; i++) out[`email_${String(++n).padStart(3, "0")}`] = make();
  };
  add(40, () => row("SI_REQUEST"));
  add(30, () => row("BL_COMPARISON"));
  add(10, () => row("BL_COMPARISON", { status: "MISMATCH", has_defect: true, defect_fields: ["consignee"] }));
  add(5, () => row("BL_COMPARISON", { status: "NEEDS_REVIEW", review_reason: "unreadable" }));
  add(2, () => row("BL_COMPARISON", { status: "NEEDS_REVIEW", review_reason: "missing_value" }));
  add(1, () => row("SPAM"));
  return out;
}

describe("splitIds", () => {
  it("is disjoint and covers every email", () => {
    const all = truth();
    const split = splitIds(all, 42);

    expect(new Set([...split.train, ...split.holdout]).size).toBe(Object.keys(all).length);
    expect(split.train.filter((id) => split.holdout.includes(id))).toEqual([]);
    expect(split.seed).toBe(42);
  });

  it("holds out a fifth of each stratum, at least one when there are two or more", () => {
    const all = truth();
    const held = splitIds(all, 42).holdout.map((id) => all[id]);
    const count = (test: (r: TruthRow) => boolean) => held.filter(test).length;

    expect(count((r) => r.category === "SI_REQUEST")).toBe(8);
    expect(count((r) => r.category === "BL_COMPARISON" && r.status === "OK")).toBe(6);
    expect(count((r) => r.review_reason === "unreadable")).toBe(1);
    expect(count((r) => r.review_reason === "missing_value")).toBe(1);
  });

  it("keeps a share of the planted defects, which carry half the final score", () => {
    const all = truth();
    const held = splitIds(all, 42).holdout.filter((id) => all[id].has_defect);
    expect(held).toHaveLength(2);
  });

  it("leaves a stratum of one in train", () => {
    const all = truth();
    const held = splitIds(all, 42).holdout.filter((id) => all[id].category === "SPAM");
    expect(held).toEqual([]);
  });

  it("gives the same split for the same seed and a different one for another", () => {
    const all = truth();
    expect(splitIds(all, 42)).toEqual(splitIds(all, 42));
    expect(splitIds(all, 7).holdout).not.toEqual(splitIds(all, 42).holdout);
  });
});
