import type { EvalReport } from "../contracts";
import type { Queryable } from "../db";
import { chainsForRun } from "../ontology/repositories/classifications.eval";
import { buildSubmission } from "../ontology/submission";
import { compareEmail } from "./compare";
import { loadGroundTruth } from "./ground-truth";
import { loadSplit } from "./id-lists";
import { scoreAll, type Submission, type Truth } from "./score";

function sameFields(a: string[] = [], b: string[] = []): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

/** The emails this run got wrong on each scored axis, by the scorer's own definitions. */
function wrongIds(truth: Truth, sub: Submission, ids: string[]): EvalReport["wrong"] {
  const wrong: EvalReport["wrong"] = { stage1: [], stage3: [], e2e: [] };
  for (const id of ids) {
    const gold = truth[id];
    const row = sub[id] ?? {};
    if (!gold) continue;
    const routed = row.category === "BL_COMPARISON";
    if ((row.category ?? "GENERAL") !== gold.category) wrong.stage1.push(id);
    if (gold.category !== "BL_COMPARISON") continue;
    if (gold.status !== "NEEDS_REVIEW" && (Boolean(row.has_defect) && routed) !== gold.has_defect) wrong.stage3.push(id);
    if (gold.has_defect && !(routed && row.has_defect && sameFields(row.defect_fields, gold.defect_fields))) wrong.e2e.push(id);
  }
  return wrong;
}

/**
 * A run scored here, against the answer key. Three scopes, because a run may
 * hold only part of the inbox: `run` is over the emails it holds, `holdout`
 * over the held-out fifth, `full` over all 520 as the organisers' scorer sees it.
 */
export async function evaluateRun(db: Queryable, runId: string): Promise<EvalReport> {
  const [truth, split, built, chains] = await Promise.all([
    loadGroundTruth(),
    loadSplit(),
    buildSubmission(db, runId),
    chainsForRun(db, runId),
  ]);
  const inRun = Object.keys(built.payload).sort();
  const held = new Set(split.holdout);
  return {
    full: scoreAll(truth, built.payload),
    holdout: scoreAll(truth, built.payload, { only: split.holdout }),
    run: scoreAll(truth, built.payload, { only: inRun }),
    wrong: wrongIds(truth, built.payload, inRun),
    emails: inRun
      .filter((id) => truth[id])
      .map((id) => compareEmail(id, truth[id], built.payload[id], held.has(id), chains.get(id))),
  };
}
