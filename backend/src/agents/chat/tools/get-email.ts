import { z } from "zod";

import { emails } from "../../../ontology/repositories";
import { buildEmailTrace, latestRunFor } from "../../../ontology/trace";
import { type ChatTool, refused, type ToolContext, type ToolOutcome } from "./types";

/**
 * What happened to one email, in ten lines.
 *
 * The cheap lookup: a question that names an email usually wants its category,
 * its status and which fields differed, and paying for the full narrative of
 * `explain_decision` to learn that would be slower and no more true.
 */

const Input = z.object({
  emailId: z.string().min(1).max(120),
  /** Absent, the most recent run this email took part in, which is what a person asking about it means. */
  runId: z.uuid().optional(),
});
type Input = z.infer<typeof Input>;

export const getEmail: ChatTool<Input> = {
  name: "get_email",
  description:
    "The summary of one email: its category, how sure the model was, its comparison status, which of the " +
    "seven fields differed, and whether a person touched it. Give runId only when the question names a run.",
  schema: Input,
  shape: Input.shape,

  async run(input, ctx: ToolContext): Promise<ToolOutcome> {
    const runId = input.runId ?? ctx.runId ?? (await latestRunFor(ctx.pool, input.emailId));
    if (!runId) return refused(`no run has ever processed ${input.emailId}`, "core.email_runs");

    const trace = await buildEmailTrace(ctx.pool, runId, input.emailId);
    if (!trace) return refused(`${input.emailId} was not part of run ${runId}`, "core.email_runs");

    // Who sent it and what it said is never part of what the pipeline
    // decided, so it is a second, cheap read against the inbox row.
    const stored = await emails.get(ctx.pool, input.emailId);
    const { classification: sorted, comparison } = trace;
    const differed = comparison?.fields.filter((field) => !field.same && !field.missing) ?? [];

    const lines = [
      `email_id: ${trace.emailId}`,
      `run_id: ${runId}`,
      stored ? `from: ${stored.from}` : null,
      stored ? `subject: ${stored.subject}` : null,
      `stage: ${trace.stage}`,
      `category: ${sorted ? (sorted.humanCategory ?? sorted.finalCategory) : "not sorted yet"}`,
      sorted ? `confidence: ${sorted.generator.confidence}` : null,
      sorted ? `decided_by: ${sorted.decidedBy}` : null,
      `status: ${comparison?.status ?? "no comparison"}`,
      comparison?.reviewReason ? `review_reason: ${comparison.reviewReason}` : null,
      `fields that differ: ${differed.length > 0 ? differed.map((field) => field.field).join(", ") : "none"}`,
      `documents: ${trace.documents.map((doc) => `${doc.filename} (${doc.docType ?? "unknown type"})`).join(", ") || "none"}`,
      `model calls: ${trace.calls.length}`,
      trace.review ? `waiting on a person: ${trace.review.reason ?? trace.review.kind}` : null,
      trace.error ? `error: ${trace.error}` : null,
    ].filter((line): line is string => line !== null);

    return {
      ok: true,
      text: lines.join("\n"),
      preview: `${trace.emailId}: ${comparison?.status ?? trace.stage}`,
      touched: [
        { relation: "core.emails", count: stored ? 1 : 0 },
        { relation: "core.classifications", count: sorted ? 1 : 0 },
        { relation: "core.comparisons", count: comparison ? 1 : 0 },
        { relation: "core.field_diffs", count: comparison?.fields.length ?? 0 },
      ],
      entities: [trace.emailId, ...differed.map((field) => field.field)],
    };
  },
};
