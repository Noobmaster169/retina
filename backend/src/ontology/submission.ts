import { SubmissionRow } from "../contracts";
import type { Queryable } from "../db";
import { TerminalError } from "../lib/errors";
import { emailRuns, type SubmissionSource } from "./repositories";

export interface BuiltSubmission {
  payload: Record<string, SubmissionRow>;
  /** Emails the pipeline has not finished with, or never classified. Submitting them scores its defaults, not its work. */
  incomplete: string[];
}

const SETTLED = new Set(["done", "review"]);

/**
 * The scorer's JSON for one run, derived from what the pipeline stored and
 * never written by hand. Every row is parsed against the organisers' enums on
 * the way out, so a value they did not define cannot be submitted.
 */
export function assembleSubmission(sources: SubmissionSource[]): BuiltSubmission {
  const payload: Record<string, SubmissionRow> = {};
  const incomplete: string[] = [];
  for (const row of sources) {
    const category = row.humanCategory ?? row.finalCategory;
    if (!category || !SETTLED.has(row.stage)) incomplete.push(row.emailId);

    const status = row.status ?? "OK";
    const parsed = SubmissionRow.safeParse({
      // An unclassified email is sent as the scorer's own default for a missing one.
      category: category ?? "GENERAL",
      status,
      review_reason: status === "NEEDS_REVIEW" ? row.reviewReason : null,
      has_defect: status === "MISMATCH",
      // Phase 6 fills this from field_diffs. Until then nothing is compared, so nothing differs.
      defect_fields: [],
      decided_by: "llm",
    });
    if (!parsed.success) {
      throw new TerminalError(`email ${row.emailId} would submit a value outside the organisers' enums`, {
        cause: parsed.error,
      });
    }
    payload[row.emailId] = parsed.data;
  }
  return { payload, incomplete };
}

export async function buildSubmission(db: Queryable, runId: string): Promise<BuiltSubmission> {
  return assembleSubmission(await emailRuns.listForSubmission(db, runId));
}
