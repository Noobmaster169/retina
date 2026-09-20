import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { bind, recipes } from "../../src/agents/chat/skills/recipes";
import { classifications, comparisons, emailRuns, fieldDiffs, llmCalls, reviewActions, reviewCases } from "../../src/ontology/repositories";
import type { FieldJudgement } from "../../src/pipeline/compare";
import { ACME_FE, ACME_ME, ALPHA, BETA, GAMMA, NORTHWIND, seedInbox, type SeededInbox } from "../chat-seed";
import { inRollback } from "../db";

/**
 * Every recipe against rows whose right answer is known. The column test in
 * recipes.test.ts passes on an empty table; this is the one that says a recipe
 * counts what it claims to.
 *
 * Three emails, all sorted as comparisons. The first ended MISMATCH on the
 * consignee with the weight missing; the second OK; the third went to a person
 * for a missing value while one of its fields also differed, which is the case
 * that tells a count of mismatches from a count of differing rows.
 */

const FIELDS = ["shipper", "consignee", "notify_party", "port_of_loading", "port_of_discharge", "container_count", "gross_weight_kg"] as const;

function judged(overrides: Partial<Record<(typeof FIELDS)[number], Partial<FieldJudgement>>>): FieldJudgement[] {
  return FIELDS.map((field) => ({
    field, siValue: "A", blValue: "A", same: true, missing: false, confidence: 0.95, rationale: "the same", ...overrides[field],
  }));
}

/** A value absent on one side is recorded with a rationale and no confidence, because no model judged it. */
const GAP = { blValue: null, same: false, missing: true, confidence: null, rationale: "the draft gives no value" };
const DIFFERS = { blValue: "B", same: false, rationale: "a different company" };

async function decorate(tx: PoolClient, seeded: SeededInbox): Promise<void> {
  const outcomes = [
    { status: "MISMATCH" as const, reason: null, fields: judged({ consignee: DIFFERS, gross_weight_kg: GAP }) },
    { status: "OK" as const, reason: null, fields: judged({}) },
    { status: "NEEDS_REVIEW" as const, reason: "missing_value" as const, fields: judged({ notify_party: DIFFERS, gross_weight_kg: GAP }) },
  ];
  for (const [index, emailId] of seeded.emailIds.entries()) {
    const emailRunId = (await emailRuns.idOf(tx, seeded.runId, emailId)) as string;
    await classifications.upsert(tx, {
      emailRunId, genCategory: "BL_COMPARISON", genConfidence: 0.97, verCategory: null, verConfidence: null,
      finalCategory: "BL_COMPARISON", decidedBy: "llm", rationale: {}, model: "sonnet", promptVersion: "v3",
    });
    const outcome = outcomes[index];
    await comparisons.upsert(tx, { emailRunId, status: outcome.status, reviewReason: outcome.reason, detail: {} });
    await fieldDiffs.replaceAll(tx, (await comparisons.idFor(tx, emailRunId)) as string, outcome.fields);
    await llmCalls.insert(tx, { runId: seeded.runId, emailRunId, step: "classify", model: "sonnet", promptVersion: "v3", request: {}, latencyMs: 1000 * (index + 1), ok: index !== 2, costUsd: 0.01, attempt: 1 });

    if (outcome.status === "NEEDS_REVIEW") {
      const raised = await reviewCases.raise(tx, { emailRunId, reason: "missing_value", stage: "comparing", detail: {} });
      await reviewActions.insert(tx, { reviewCaseId: raised.id, emailRunId, kind: "correct_field", field: "gross_weight_kg", side: "BL", oldValue: null, newValue: "41,000 KG", actor: "a reviewer" });
    }
  }
}

async function run(tx: PoolClient, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const recipe = recipes().get(name);
  if (!recipe) throw new Error(`no recipe ${name}`);
  const bound = bind(recipe, args);
  if (!bound.ok) throw new Error(bound.reason);
  return (await tx.query(recipe.sql, bound.values)).rows;
}

const n = (value: unknown) => Number(value);

describe("the recipes count what they say they count", () => {
  it("counts-and-rates", async () => {
    await inRollback(async (tx) => {
      const seeded = await seedInbox(tx);
      await decorate(tx, seeded);
      const runId = seeded.runId;

      expect(await run(tx, "emails_by_category", { run_id: runId })).toMatchObject([{ category: "BL_COMPARISON" }]);
      expect(n((await run(tx, "emails_by_category", { run_id: runId }))[0].emails)).toBe(3);

      const statuses = await run(tx, "comparisons_by_status", { run_id: runId });
      expect(new Set(statuses.map((row) => `${row.status}:${row.review_reason ?? ""}:${n(row.emails)}`))).toEqual(new Set(["MISMATCH::1", "OK::1", "NEEDS_REVIEW:missing_value:1"]));

      // Every comparison here has fields a model judged; the gap row alone would not have counted.
      const [denominators] = await run(tx, "judged_emails", { run_id: runId });
      expect([n(denominators.comparison_category_emails), n(denominators.with_comparison_row), n(denominators.with_judged_fields), n(denominators.mismatches)]).toEqual([3, 3, 3, 1]);

      const [sender] = await run(tx, "senders_ranked", { run_id: runId });
      expect([sender.sender_domain, n(sender.emails), n(sender.comparisons), n(sender.mismatches)]).toEqual(["vitalsolutions.sg", 3, 3, 1]);
    });
  });

  it("judged_emails leaves out a comparison whose every field was a gap", async () => {
    await inRollback(async (tx) => {
      const seeded = await seedInbox(tx);
      await decorate(tx, seeded);
      const emailRunId = (await emailRuns.idOf(tx, seeded.runId, seeded.emailIds[1])) as string;
      const allGaps = Object.fromEntries(FIELDS.map((field) => [field, GAP]));
      await fieldDiffs.replaceAll(tx, (await comparisons.idFor(tx, emailRunId)) as string, judged(allGaps));
      const [denominators] = await run(tx, "judged_emails", { run_id: seeded.runId });
      expect(n(denominators.with_judged_fields)).toBe(2);
    });
  });

  it("quality-and-review", async () => {
    await inRollback(async (tx) => {
      const seeded = await seedInbox(tx);
      await decorate(tx, seeded);
      const runId = seeded.runId;

      // The notify_party that differs sits in an email that went to a person, not one that ended MISMATCH,
      // and a missing weight is never a difference: the screens count one differing field, and so does this.
      expect((await run(tx, "mismatches_by_field", { run_id: runId })).map((row) => [row.field, n(row.differing_emails)])).toEqual([["consignee", 1]]);

      const forAcme = await run(tx, "mismatches_for_entities", { entity_ids: [seeded.idOf(ACME_ME)], run_id: runId });
      expect(forAcme).toMatchObject([{ email_id: seeded.emailIds[0], field: "consignee", si_value: "A", bl_value: "B" }]);
      expect(await run(tx, "mismatches_for_entities", { entity_ids: [seeded.idOf(ACME_FE)], run_id: runId })).toEqual([]);

      expect(await run(tx, "reviews_by_reason", { run_id: runId })).toMatchObject([{ kind: "review", reason: "missing_value", status: "open" }]);
      expect(await run(tx, "human_corrections", { run_id: runId })).toMatchObject([
        { email_id: seeded.emailIds[2], kind: "correct_field", field: "gross_weight_kg", side: "BL", new_value: "41,000 KG", actor: "a reviewer" },
      ]);

      const [cost] = await run(tx, "cost_by_step", { run_id: runId });
      expect([cost.step, n(cost.model_calls), n(cost.failed), n(cost.cost_usd), n(cost.avg_latency_ms)]).toEqual(["classify", 3, 1, 0.03, 2000]);
    });
  });

  it("ground-names", async () => {
    await inRollback(async (tx) => {
      const seeded = await seedInbox(tx);
      const runId = seeded.runId;
      const northwind = seeded.idOf(NORTHWIND);

      const roles = await run(tx, "entity_roles", { entity_ids: [northwind] });
      expect(new Map(roles.map((row) => [row.field, n(row.emails)]))).toEqual(new Map([["consignee", 2], ["notify_party", 2]]));

      const named = await run(tx, "entities_named_like", { kind: "port", pattern: "%LEMURIA%" });
      expect(named.map((row) => row.canonical).sort()).toEqual([BETA, GAMMA]);
      expect(await run(tx, "entities_named_like", { kind: "party", pattern: "%LEMURIA%" })).toEqual([]);

      expect(await run(tx, "emails_by_sender_domain", { domain: "vitalsolutions.sg", run_id: runId })).toHaveLength(3);
      expect(await run(tx, "emails_by_sender_domain", { domain: "nobody.example", run_id: runId })).toEqual([]);
      expect(await run(tx, "subjects_like", { pattern: "%IVORY BOARD%", run_id: runId })).toHaveLength(3);
      expect(await run(tx, "subjects_like", { pattern: "%no such words%", run_id: runId })).toEqual([]);

      // Who appears in the same emails as the Middle East shipper: never itself, and counted in emails.
      const withAcme = await run(tx, "parties_seen_with", { entity_ids: [seeded.idOf(ACME_ME)], run_id: runId });
      expect(withAcme.map((row) => row.other_party)).not.toContain(ACME_ME);
      expect(withAcme.find((row) => row.other_party === NORTHWIND && row.other_field === "notify_party")).toMatchObject({ emails: "2" });
    });
  });

  it("pick-the-run and lanes-and-ports", async () => {
    await inRollback(async (tx) => {
      const seeded = await seedInbox(tx);
      const runId = seeded.runId;

      const [latest] = await run(tx, "latest_run", {});
      expect([latest.run_id, n(latest.finished_emails)]).toEqual([runId, 3]);
      expect(await run(tx, "run_overview", { run_id: runId })).toMatchObject([{ stage: "done", emails: "3" }]);

      const lane = await run(tx, "emails_for_lane", { pol_ids: [seeded.idOf(ALPHA)], pod_ids: [seeded.idOf(BETA)], run_id: runId });
      expect(lane.map((row) => row.email_id).sort()).toEqual([seeded.emailIds[0], seeded.emailIds[2]].sort());
      // Several spellings of one place are passed together, and an email is still listed once.
      const both = await run(tx, "emails_for_lane", { pol_ids: [seeded.idOf(ALPHA)], pod_ids: [seeded.idOf(BETA), seeded.idOf(GAMMA)], run_id: runId });
      expect(both).toHaveLength(3);
    });
  });
});
