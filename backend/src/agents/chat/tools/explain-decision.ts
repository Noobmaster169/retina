import { z } from "zod";

import type { EmailTrace } from "../../../contracts";
import { emailRuns, reviewActions } from "../../../ontology/repositories";
import { buildEmailTrace, latestRunFor } from "../../../ontology/trace";
import { type ChatTool, refused, type ToolContext, type ToolOutcome } from "./types";

/**
 * The whole story of one email, in the order it happened.
 *
 * The same spine the trace page draws, in words: what the generator said, what
 * the verifier said, what was read out of each document and whether the quote
 * was found, how the judge called each pair, why it escalated, and what a
 * person did. Phase 11's lesson drafter reads this shape, so it stays stable.
 *
 * Every rationale here comes from the read-write pool, because retina_ro is
 * not granted `llm_calls.parsed` and the narrative is mostly made of
 * rationales. The queries behind it are fixed text in this repository, not
 * anything a model composed, which is what makes that safe.
 */

const Input = z.object({
  emailId: z.string().min(1).max(120),
  runId: z.uuid().optional(),
});
type Input = z.infer<typeof Input>;

function sorting(trace: EmailTrace): string[] {
  const sorted = trace.classification;
  if (!sorted) return ["## How it was sorted", "It has not been sorted yet."];
  const lines = [
    "## How it was sorted",
    `The generator said ${sorted.generator.category} at ${sorted.generator.confidence}: ${sorted.generator.rationale}`,
  ];
  if (sorted.verifier) {
    lines.push(
      `The verifier said ${sorted.verifier.category} at ${sorted.verifier.confidence}: ${sorted.verifier.rationale}`,
    );
    if (sorted.verifier.counterCases) lines.push(`It weighed against: ${sorted.verifier.counterCases}`);
  } else if (sorted.verifierError) {
    lines.push(`The verifier failed (${sorted.verifierError}), so the generator's category stood.`);
  } else {
    lines.push("The generator was sure enough that the verifier did not run.");
  }
  lines.push(`${sorted.decidedBy} settled it as ${sorted.humanCategory ?? sorted.finalCategory}.`);
  return lines;
}

function reading(trace: EmailTrace): string[] {
  if (trace.extractions.length === 0) return [];
  const lines = ["## What was read from each document"];
  for (const extraction of trace.extractions) {
    lines.push(`### ${extraction.filename}, read as the ${extraction.role}${extraction.verified ? ", re-read by the verifier" : ""}`);
    for (const field of extraction.fields) {
      const value = field.humanValue ?? field.value;
      const corrected = field.humanValue ? ` (a person corrected it from ${field.value ?? "nothing"})` : "";
      if (value === null) {
        lines.push(`- ${field.field}: nothing${field.placeholder ? `, the document had the placeholder ${field.placeholder}` : ""}`);
        continue;
      }
      // The evidence flag is the point of the quote: a value the extractor
      // could not locate in the text is a value nothing stands behind.
      const evidence = field.evidenceOk
        ? `quoted as "${field.sourceQuote}"`
        : "the quote for it was NOT found in the document text";
      lines.push(`- ${field.field}: ${value}${corrected}, ${evidence}, confidence ${field.confidence}`);
    }
  }
  return lines;
}

function judging(trace: EmailTrace): string[] {
  const comparison = trace.comparison;
  if (!comparison) return ["## How the pair was judged", "It never reached a comparison."];
  const lines = ["## How the pair was judged"];
  for (const field of comparison.fields) {
    const verdict = field.missing ? "could not be compared" : field.same ? "agree" : "DIFFER";
    lines.push(
      `- ${field.field}: SI ${field.siValue ?? "nothing"} against BL ${field.blValue ?? "nothing"}, they ${verdict}` +
        `${field.confidence === null ? "" : ` at ${field.confidence}`}${field.rationale ? `: ${field.rationale}` : ""}`,
    );
  }
  lines.push(`It came out ${comparison.status}${comparison.reviewReason ? ` because of ${comparison.reviewReason}` : ""}.`);
  return lines;
}

export const explainDecision: ChatTool<Input> = {
  name: "explain_decision",
  description:
    "The full audit trail of one email as a narrative: the generator's and verifier's reasoning, every " +
    "value read from each document with its quote and whether that quote was found, every field judgement " +
    "with its reasoning, why it escalated, and what a person did. Use it for `explain email_x` questions.",
  schema: Input,

  async run(input, ctx: ToolContext): Promise<ToolOutcome> {
    const runId = input.runId ?? ctx.runId ?? (await latestRunFor(ctx.pool, input.emailId));
    if (!runId) return refused(`no run has ever processed ${input.emailId}`, "core.email_runs");

    const trace = await buildEmailTrace(ctx.pool, runId, input.emailId);
    if (!trace) return refused(`${input.emailId} was not part of run ${runId}`, "core.email_runs");

    const state = await emailRuns.stateOf(ctx.pool, runId, input.emailId);
    const actions = state ? await reviewActions.listForEmailRun(ctx.pool, state.id) : [];

    const escalation = trace.review
      ? [
          "## Why it went to a person",
          `${trace.review.kind === "failure" ? "A job failed for good" : `Escalated as ${trace.review.reason}`} at the ${trace.review.stage} stage, ${trace.review.status}.`,
          JSON.stringify(trace.review.detail),
        ]
      : ["## Why it went to a person", "It did not. Nothing about it needed one."];

    const human =
      actions.length > 0
        ? ["## What a person did", ...actions.map((action) =>
            `- ${action.actor} ${action.kind}` +
            `${action.field ? ` on ${action.field}${action.side ? ` (${action.side})` : ""}` : ""}` +
            `${action.oldValue || action.newValue ? `: ${action.oldValue ?? "nothing"} -> ${action.newValue ?? "nothing"}` : ""}` +
            `${action.note ? ` "${action.note}"` : ""}`,
          )]
        : ["## What a person did", "Nobody has touched it."];

    const text = [
      `# ${trace.emailId} in run ${runId}`,
      `It is at the ${trace.stage} stage and cost ${trace.calls.length} model calls.`,
      ...sorting(trace),
      ...reading(trace),
      ...judging(trace),
      ...escalation,
      ...human,
    ].join("\n");

    const differed = trace.comparison?.fields.filter((field) => !field.same && !field.missing) ?? [];

    return {
      ok: true,
      text,
      preview: `the full trail of ${trace.emailId}, ${trace.calls.length} calls`,
      touched: [
        { relation: "core.classifications", count: trace.classification ? 1 : 0 },
        { relation: "core.extraction_fields", count: trace.extractions.reduce((sum, one) => sum + one.fields.length, 0) },
        { relation: "core.field_diffs", count: trace.comparison?.fields.length ?? 0 },
        { relation: "core.review_actions", count: actions.length },
      ],
      entities: [trace.emailId, ...differed.map((field) => field.field)],
    };
  },
};
