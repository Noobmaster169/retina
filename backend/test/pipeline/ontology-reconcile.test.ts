import { describe, expect, it } from "vitest";

import { type ExistingEntity, reconcile, type ResolvedEntity } from "../../src/pipeline/ontology";

/**
 * What a refresh must not do: change the id of a thing that is still the same
 * thing. Every case below is one way the clusters can move between two passes.
 */

function cluster(canonical: string, names: [string, number][], mentions = names.reduce((sum, [, seen]) => sum + seen, 0)): ResolvedEntity {
  return {
    kind: "party",
    canonical,
    names: names.map(([value, seenCount], at) => ({
      value,
      seenCount,
      joinedBy: at === 0 ? "kept" : "judge",
      confidence: at === 0 ? null : 0.95,
      joinedStep: null,
    })),
    // Only the count is read here; a mention's own fields belong to the writer.
    mentions: Array.from({ length: mentions }, () => ({ extractionFieldId: 0, emailRunId: 1, field: "consignee" as const, value: canonical, seenAt: new Date(0) })),
    sightingCount: 0,
    firstSeenAt: new Date(0),
    lastSeenAt: new Date(0),
  };
}

function existing(id: number, names: [string, number][], mentionCount = names.reduce((sum, [, seen]) => sum + seen, 0)): ExistingEntity {
  return { id, kind: "party", mentionCount, names: names.map(([value, seenCount]) => ({ value, seenCount })) };
}

describe("reconcile", () => {
  it("keeps the id of the entity that already holds the cluster's spellings", () => {
    const plan = reconcile([cluster("ROXCEL TRADING GMBH", [["ROXCEL TRADING GMBH", 4], ["ROXCEL", 1]])], [existing(7, [["ROXCEL TRADING GMBH", 4], ["ROXCEL", 1]])]);

    expect(plan.keep).toEqual([{ id: 7, cluster: expect.objectContaining({ canonical: "ROXCEL TRADING GMBH" }) }]);
    expect(plan.insert).toEqual([]);
    expect(plan.merge).toEqual([]);
    expect(plan.drop).toEqual([]);
  });

  it("keeps the id when a new spelling joins a cluster nothing else holds", () => {
    const plan = reconcile([cluster("UAB NOVAKOPA", [["UAB NOVAKOPA", 3], ["NOVAKOPA UAB", 1]])], [existing(11, [["UAB NOVAKOPA", 3]])]);

    expect(plan.keep.map((kept) => kept.id)).toEqual([11]);
    expect(plan.merge).toEqual([]);
  });

  it("inserts a cluster nothing in the database holds", () => {
    const plan = reconcile([cluster("VITAL SOLUTIONS PTE LTD", [["VITAL SOLUTIONS PTE LTD", 2]])], []);

    expect(plan.keep).toEqual([]);
    expect(plan.insert.map((one) => one.canonical)).toEqual(["VITAL SOLUTIONS PTE LTD"]);
  });

  it("merges two entities a new verdict joined, and the one with more mentions survives", () => {
    const plan = reconcile(
      [cluster("AL GURG TRADING LLC", [["AL GURG TRADING LLC", 6], ["AL GURG TRADING", 2]])],
      [existing(3, [["AL GURG TRADING LLC", 6]]), existing(9, [["AL GURG TRADING", 2]])],
    );

    expect(plan.keep.map((kept) => kept.id)).toEqual([3]);
    expect(plan.merge).toEqual([{ from: 9, into: 3 }]);
    expect(plan.drop).toEqual([]);
  });

  it("lets the mention count and not the spelling decide which row survives a merge", () => {
    // Id 9 holds the cluster's most-seen spelling and almost no evidence; id 3
    // holds the rest. The profile worth keeping is the one on id 3.
    const plan = reconcile(
      [cluster("FUJITO PAPER", [["FUJITO PAPER", 5], ["FUJITO PAPER CO LTD", 4]])],
      [existing(3, [["FUJITO PAPER CO LTD", 4]], 40), existing(9, [["FUJITO PAPER", 5]], 5)],
    );

    expect(plan.keep.map((kept) => kept.id)).toEqual([3]);
    expect(plan.merge).toEqual([{ from: 9, into: 3 }]);
  });

  it("gives the id to the larger part when one entity splits in two", () => {
    const plan = reconcile(
      [cluster("SAFQA LIMITED", [["SAFQA LIMITED", 8]]), cluster("SAFQA KENYA", [["SAFQA KENYA", 1]])],
      [existing(5, [["SAFQA LIMITED", 8], ["SAFQA KENYA", 1]])],
    );

    expect(plan.keep).toEqual([{ id: 5, cluster: expect.objectContaining({ canonical: "SAFQA LIMITED" }) }]);
    expect(plan.insert.map((one) => one.canonical)).toEqual(["SAFQA KENYA"]);
    expect(plan.merge).toEqual([]);
    expect(plan.drop).toEqual([]);
  });

  it("drops an entity whose every spelling has gone from the data", () => {
    const plan = reconcile([cluster("TOPKOPY", [["TOPKOPY", 2]])], [existing(2, [["TOPKOPY", 2]]), existing(4, [["BDP INTERNATIONAL", 3]])]);

    expect(plan.keep.map((kept) => kept.id)).toEqual([2]);
    expect(plan.drop).toEqual([4]);
  });

  it("never claims an entity of another kind that is spelt the same way", () => {
    const port = { ...cluster("SINGAPORE", [["SINGAPORE", 3]]), kind: "port" as const };
    const plan = reconcile([port], [{ ...existing(8, [["SINGAPORE", 9]]), kind: "party" as const }]);

    expect(plan.keep).toEqual([]);
    expect(plan.insert.map((one) => one.canonical)).toEqual(["SINGAPORE"]);
    expect(plan.drop).toEqual([8]);
  });

  it("plans nothing for nothing", () => {
    expect(reconcile([], [])).toEqual({ keep: [], insert: [], merge: [], drop: [] });
  });
});
