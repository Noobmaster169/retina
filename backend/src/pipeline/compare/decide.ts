import type { ComparisonField, ComparisonStatus, ReviewReason } from "../../contracts";
import type { Assembled } from "./assemble";

/** The organisers' verdict on a pair, derived from the assembled judgements and never written by hand. */
export interface Decision {
  status: ComparisonStatus;
  reviewReason: ReviewReason | null;
  /** The differing fields. On a `missing_value` escalation these are provisional, for the reviewer. */
  defectFields: ComparisonField[];
  missing: ComparisonField[];
}

/**
 * A missing value on either side is uncertainty, and the organisers' enum has
 * one reason for it. Otherwise the pair is clean or it has defects. Precedence
 * across the whole pipeline is unreadable, wrong_doc_type, missing_attachment,
 * then missing_value; the first three are decided before any field is read.
 */
export function decide(assembled: Assembled): Decision {
  const { defectFields, missing } = assembled;
  if (missing.length > 0) return { status: "NEEDS_REVIEW", reviewReason: "missing_value", defectFields, missing };
  if (defectFields.length === 0) return { status: "OK", reviewReason: null, defectFields: [], missing: [] };
  return { status: "MISMATCH", reviewReason: null, defectFields, missing: [] };
}

/** What the review case and the comparison row record of a decision, in the organisers' names. */
export function decisionDetail(decision: Decision): Record<string, unknown> {
  return {
    status: decision.status,
    review_reason: decision.reviewReason,
    defect_fields: decision.defectFields,
    missing: decision.missing,
  };
}
