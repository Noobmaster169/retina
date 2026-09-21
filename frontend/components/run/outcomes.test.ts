import { describe, expect, it } from "vitest";

import type { RunSummary } from "@/lib/api/runs-schemas";

import { outcomeBreakdown } from "./outcomes";

/**
 * One denominator is the whole point of this module, so every case here is
 * about what the shares are taken against.
 */

type Counts = Pick<RunSummary, "outcomes" | "review">;

const NO_FIELDS = {
  shipper: 0,
  consignee: 0,
  notify_party: 0,
  port_of_loading: 0,
  port_of_discharge: 0,
  container_count: 0,
  gross_weight_kg: 0,
};

function counts(ok: number, mismatch: number, byReason: Partial<Counts["review"]["byReason"]> = {}): Counts {
  const reasons = { wrong_doc_type: 0, missing_attachment: 0, unreadable: 0, missing_value: 0, ...byReason };
  return {
    outcomes: { ok, mismatch, byField: NO_FIELDS },
    review: { open: Object.values(reasons).reduce((sum, count) => sum + count, 0), byReason: reasons },
  };
}

describe("outcomeBreakdown", () => {
  const breakdown = outcomeBreakdown(counts(62, 46, { wrong_doc_type: 5, missing_attachment: 5, unreadable: 5, missing_value: 5 }), 300);

  it("keeps the organisers' enum on every slice, whatever the panel calls it", () => {
    expect(breakdown.slices.map((slice) => slice.key)).toEqual([
      "not_comparable",
      "OK",
      "MISMATCH",
      "wrong_doc_type",
      "missing_attachment",
      "unreadable",
      "missing_value",
    ]);
  });

  it("names each one in plain English, because the enums are not what a business owner reads", () => {
    expect(breakdown.slices.map((slice) => slice.label)).toEqual([
      "No check needed",
      "Documents agree",
      "Documents differ",
      "Wrong document",
      "Document missing",
      "Could not be read",
      "Detail missing",
    ]);
  });

  it("falls back to the enum for an outcome it has no words for, rather than showing nothing", () => {
    const unknown = outcomeBreakdown(
      { outcomes: counts(0, 0).outcomes, review: { open: 1, byReason: { wrong_doc_type: 1 } } } as Counts,
      0,
    );
    expect(unknown.slices.map((slice) => slice.label)).toContain("Wrong document");
  });

  it("counts every landed email once, which is what a pie's whole has to be", () => {
    expect(breakdown.total).toBe(428);
    expect(breakdown.slices.reduce((sum, slice) => sum + slice.count, 0)).toBe(breakdown.total);
  });

  it("takes every share against that one total, so two equal bars mean the same thing", () => {
    const shares = Object.fromEntries(breakdown.slices.map((slice) => [slice.key, slice.pct]));
    expect(shares.not_comparable).toBeCloseTo((300 / 428) * 100, 5);
    expect(shares.OK).toBeCloseTo((62 / 428) * 100, 5);
    expect(shares.unreadable).toBeCloseTo((5 / 428) * 100, 5);
    expect(breakdown.slices.reduce((sum, slice) => sum + slice.pct, 0)).toBeCloseTo(100, 5);
  });

  it("separates what the pipeline finished from what is waiting for a person", () => {
    expect(breakdown.parked).toBe(20);
    expect(breakdown.slices.filter((slice) => slice.group === "parked").map((slice) => slice.key)).toEqual([
      "wrong_doc_type",
      "missing_attachment",
      "unreadable",
      "missing_value",
    ]);
  });

  it("gives every parked reason a violet, because each is an uncertainty and not a fault", () => {
    expect(breakdown.slices.filter((slice) => slice.group === "parked").every((slice) => slice.tone === "review")).toBe(true);
  });

  it("keeps a difference and an uncertainty in different hues", () => {
    expect(breakdown.slices.find((slice) => slice.key === "MISMATCH")?.tone).toBe("differ");
    expect(breakdown.slices.filter((slice) => slice.group === "parked").some((slice) => slice.tone === "differ")).toBe(false);
  });

  it("says what each enum means, because the name does not", () => {
    expect(breakdown.slices.every((slice) => slice.says.length > 0)).toBe(true);
  });

  it("does not divide by zero before anything has landed", () => {
    const empty = outcomeBreakdown(counts(0, 0), 0);
    expect(empty.total).toBe(0);
    expect(empty.slices.every((slice) => slice.pct === 0)).toBe(true);
  });
});
