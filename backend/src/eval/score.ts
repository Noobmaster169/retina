/**
 * A port of emails/server/scoring.py, function by function. Field names stay
 * snake_case because the result is the organisers' JSON: the page renders a
 * scoreboard the same way whether it came from here or from their /submit.
 * `pnpm eval:parity` proves the two agree.
 */
import type { Category, Scoreboard, SubmissionRow, TruthRow } from "../contracts";

export const CATEGORIES: Category[] = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"];
export const REVIEW_REASONS = ["wrong_doc_type", "missing_attachment", "unreadable", "missing_value"] as const;
export const DEFAULT_WEIGHTS = { stage1: 0.3, stage3: 0.2, end_to_end: 0.5 };

export type Truth = Record<string, TruthRow>;
/** What the scorer accepts: any part of a row may be missing, and a category may be one it does not know. */
export type ScoredRow = Partial<Omit<SubmissionRow, "category">> & { category?: string };
export type Submission = Record<string, ScoredRow>;

interface Counts {
  tp: number;
  fp: number;
  fn: number;
}

function prf({ tp, fp, fn }: Counts): { p: number; r: number; f: number } {
  const p = tp + fp ? tp / (tp + fp) : 0;
  const r = tp + fn ? tp / (tp + fn) : 0;
  return { p, r, f: p + r ? (2 * p * r) / (p + r) : 0 };
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}

/** The scorer treats an email that is missing from the submission as an empty row. */
function rowOf(sub: Submission, emailId: string): ScoredRow {
  return sub[emailId] ?? {};
}

export function scoreStage1(truth: Truth, sub: Submission): Scoreboard["stage1"] {
  const per = Object.fromEntries(CATEGORIES.map((c) => [c, { tp: 0, fp: 0, fn: 0 }])) as Record<Category, Counts>;
  const confusion: Record<string, Record<string, number>> = {};
  let correct = 0;
  let ruleHits = 0;
  let ruleTotal = 0;

  for (const [emailId, gold] of Object.entries(truth)) {
    const row = rowOf(sub, emailId);
    const predicted = row.category ?? "GENERAL";
    confusion[gold.category] ??= {};
    confusion[gold.category][predicted] = (confusion[gold.category][predicted] ?? 0) + 1;

    if (predicted === gold.category) {
      correct += 1;
      per[gold.category].tp += 1;
    } else {
      per[gold.category].fn += 1;
      if (predicted in per) per[predicted as Category].fp += 1;
    }
    if (row.decided_by != null) {
      ruleTotal += 1;
      if (row.decided_by === "rule") ruleHits += 1;
    }
  }

  const total = Object.keys(truth).length;
  return {
    accuracy: total ? correct / total : 0,
    macro_f1: CATEGORIES.reduce((sum, c) => sum + prf(per[c]).f, 0) / CATEGORIES.length,
    rule_pct: ruleTotal ? ruleHits / ruleTotal : null,
    per,
    confusion,
  };
}

/** Defect detection on the comparison emails that could be compared. NEEDS_REVIEW is graded elsewhere. */
export function scoreStage3(truth: Truth, sub: Submission): Scoreboard["stage3"] {
  const email = { tp: 0, fp: 0, fn: 0 };
  const field = { tp: 0, fp: 0, fn: 0 };
  let exact = 0;
  let docTotal = 0;

  for (const [emailId, gold] of Object.entries(truth)) {
    if (gold.category !== "BL_COMPARISON" || gold.status === "NEEDS_REVIEW") continue;
    docTotal += 1;
    const row = rowOf(sub, emailId);
    const routed = row.category === "BL_COMPARISON";
    // A defect on an email that was not routed to comparison does not count.
    const predictedDefect = Boolean(row.has_defect) && routed;
    const predictedFields = new Set(routed ? (row.defect_fields ?? []) : []);
    const goldFields = new Set(gold.defect_fields);

    if (gold.has_defect && predictedDefect) email.tp += 1;
    else if (gold.has_defect && !predictedDefect) email.fn += 1;
    else if (!gold.has_defect && predictedDefect) email.fp += 1;

    if (sameSet(predictedFields, goldFields)) exact += 1;
    for (const name of predictedFields) {
      if (goldFields.has(name)) field.tp += 1;
      else field.fp += 1;
    }
    for (const name of goldFields) if (!predictedFields.has(name)) field.fn += 1;
  }

  const { p, r, f } = prf(email);
  return {
    defect_precision: p,
    defect_recall: r,
    defect_f1: f,
    field_f1: prf(field).f,
    exact_match_rate: docTotal ? exact / docTotal : 0,
    doc_total: docTotal,
  };
}

/** The human-review axis: of the cases that cannot be decided, how many were escalated. Diagnostic, weight 0. */
export function scoreReliability(truth: Truth, sub: Submission): Scoreboard["reliability"] {
  const perReason = Object.fromEntries(REVIEW_REASONS.map((reason) => [reason, { total: 0, caught: 0 }]));
  let goldReview = 0;
  let predictedReview = 0;
  let caught = 0;

  for (const [emailId, gold] of Object.entries(truth)) {
    const predictedNeeds = rowOf(sub, emailId).status === "NEEDS_REVIEW";
    const goldNeeds = gold.status === "NEEDS_REVIEW";
    if (predictedNeeds) predictedReview += 1;
    if (!goldNeeds) continue;

    goldReview += 1;
    if (predictedNeeds) caught += 1;
    const reason = gold.review_reason;
    if (reason !== null && reason in perReason) {
      perReason[reason].total += 1;
      if (predictedNeeds) perReason[reason].caught += 1;
    }
  }

  const recall = goldReview ? caught / goldReview : 0;
  const precision = predictedReview ? caught / predictedReview : 0;
  return {
    escalation_recall: recall,
    escalation_precision: precision,
    escalation_f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    gold_review: goldReview,
    pred_review: predictedReview,
    per_reason: perReason,
  };
}

/** The headline: a planted defect counts only when the email was routed, flagged, and the fields are exactly right. */
export function scoreEndToEnd(truth: Truth, sub: Submission): Scoreboard["end_to_end"] {
  let total = 0;
  let success = 0;
  for (const [emailId, gold] of Object.entries(truth)) {
    if (gold.category !== "BL_COMPARISON" || !gold.has_defect) continue;
    total += 1;
    const row = rowOf(sub, emailId);
    const fieldsOk = sameSet(new Set(row.defect_fields ?? []), new Set(gold.defect_fields));
    if (row.category === "BL_COMPARISON" && Boolean(row.has_defect) && fieldsOk) success += 1;
  }
  return { success, total, rate: total ? success / total : 0 };
}

export interface ScoreOptions {
  /** Score only these emails. This is how the holdout is scored. */
  only?: string[];
}

export function scoreAll(truth: Truth, sub: Submission, options: ScoreOptions = {}): Scoreboard {
  const wanted = options.only ? new Set(options.only) : null;
  const scoped = wanted ? Object.fromEntries(Object.entries(truth).filter(([id]) => wanted.has(id))) : truth;

  const stage1 = scoreStage1(scoped, sub);
  const stage3 = scoreStage3(scoped, sub);
  const endToEnd = scoreEndToEnd(scoped, sub);
  return {
    stage1,
    stage3,
    reliability: scoreReliability(scoped, sub),
    end_to_end: endToEnd,
    weights: DEFAULT_WEIGHTS,
    final_score:
      DEFAULT_WEIGHTS.stage1 * stage1.macro_f1 +
      DEFAULT_WEIGHTS.stage3 * stage3.defect_f1 +
      DEFAULT_WEIGHTS.end_to_end * endToEnd.rate,
    n_emails: Object.keys(scoped).length,
  };
}
