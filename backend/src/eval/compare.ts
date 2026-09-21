import type { ClassifyChain, EmailVerdict, SubmissionRow, TruthRow } from "../contracts";
import { verifierEffect } from "./verifier-effect";

type Answer = Omit<SubmissionRow, "decided_by">;

/** What an email with no row in the submission counts as: the scorer's own default. */
const MISSING: Answer = { category: "GENERAL", status: "OK", review_reason: null, has_defect: false, defect_fields: [] };

function sameFields(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

/**
 * One email, the submission's answer against the truth, check by check, on the
 * scorer's definitions. A check is null where the scorer does not score it for
 * this email: the document checks only for a true BL_COMPARISON, and end to end
 * only where a defect was planted.
 */
export function compareEmail(
  emailId: string,
  truth: TruthRow,
  row: Answer | undefined,
  inHoldout: boolean,
  chain: ClassifyChain | undefined,
): EmailVerdict {
  const given = row ?? MISSING;
  const answer: Answer = {
    category: given.category,
    status: given.status,
    review_reason: given.review_reason,
    has_defect: given.has_defect,
    defect_fields: given.defect_fields,
  };
  const comparison = truth.category === "BL_COMPARISON";
  const routed = answer.category === "BL_COMPARISON";
  const truthAnswer: Answer = {
    category: truth.category,
    status: truth.status,
    review_reason: truth.review_reason,
    has_defect: truth.has_defect,
    defect_fields: truth.defect_fields,
  };
  return {
    emailId,
    inHoldout,
    submitted: row !== undefined,
    answer,
    truth: truthAnswer,
    checks: {
      category: answer.category === truth.category,
      status: comparison ? routed && answer.status === truth.status : null,
      reviewReason: comparison && truth.status === "NEEDS_REVIEW" ? routed && answer.review_reason === truth.review_reason : null,
      defect: comparison && truth.status !== "NEEDS_REVIEW" ? (routed && answer.has_defect) === truth.has_defect : null,
      defectFields: comparison && truth.has_defect ? routed && sameFields(answer.defect_fields, truth.defect_fields) : null,
      endToEnd: truth.has_defect ? routed && answer.has_defect && sameFields(answer.defect_fields, truth.defect_fields) : null,
    },
    classify: chain ? { ...chain, effect: verifierEffect(chain.genCategory, chain.verCategory, truth.category) } : null,
  };
}
