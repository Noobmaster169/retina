import type { EmailTrace } from "@/lib/api/trace-schemas";
import type { EmailVerdict } from "@/lib/api/scoring-schemas";

import { CHECK_NAMES } from "./filters";
import { CHECK_LABELS } from "./verdict-reading";

/**
 * One email's whole case as plain text, for pasting into the session where the
 * prompt is being changed. Nothing is summarised: what the readers wrote is
 * copied word for word, because a rewritten rationale is no evidence at all.
 *
 * The system prompt is named rather than pasted. It is a file on disk in
 * agents/prompts, and the reader of this note has it.
 */
export function promptNote(verdict: EmailVerdict, trace: EmailTrace | undefined): string {
  const lines: string[] = [
    `${verdict.emailId} (${verdict.inHoldout ? "holdout" : "train"})`,
    "",
    "WHAT THE SCORER SAYS",
    ...CHECK_NAMES.filter((name) => verdict.checks[name] !== null).map((name) => {
      const ok = verdict.checks[name];
      return `  ${CHECK_LABELS[name].padEnd(14)} ${ok ? "right" : "WRONG"}`;
    }),
    `  answered: ${answerLine(verdict.answer)}`,
    `  truth:    ${answerLine(verdict.truth)}`,
  ];

  const classify = verdict.classify;
  if (classify) {
    lines.push(
      "",
      `THE GENERATOR (${classify.promptVersion ?? "unknown version"}, ${classify.model ?? "unknown model"})`,
      `  said ${classify.genCategory} at ${classify.genConfidence.toFixed(2)}`,
    );
    const generator = trace?.classification?.generator.rationale;
    if (generator) lines.push(`  ${generator}`);
    lines.push("", "THE VERIFIER");
    if (classify.verCategory === null) {
      lines.push("  did not run: the generator was above the threshold");
    } else {
      lines.push(`  said ${classify.verCategory} at ${(classify.verConfidence ?? 0).toFixed(2)}`);
      const verifier = trace?.classification?.verifier;
      if (verifier?.counterCases) lines.push(`  counter-cases: ${verifier.counterCases}`);
      if (verifier?.rationale) lines.push(`  ${verifier.rationale}`);
    }
    if (trace?.classification?.verifierError) lines.push(`  the call failed: ${trace.classification.verifierError}`);
  }

  const fields = trace?.comparison?.fields ?? [];
  if (fields.length > 0) {
    lines.push("", "THE FIELD JUDGE");
    for (const field of fields) {
      lines.push(
        `  ${field.field}: SI ${quoted(field.siValue)} | BL ${quoted(field.blValue)} | ${
          field.missing ? "missing" : field.same ? "same" : "DIFFER"
        }`,
      );
      if (field.rationale) lines.push(`    ${field.rationale}`);
    }
  }

  const calls = trace?.calls ?? [];
  if (calls.length > 0) {
    lines.push("", "THE CALLS (system prompts are the files in agents/prompts)");
    for (const call of calls) {
      lines.push(
        "",
        `  ${call.step} ${call.promptVersion} ${call.model} attempt ${call.attempt} ${call.ok ? "ok" : `failed: ${call.error ?? ""}`}`,
        "  --- what the model was given ---",
        indent(call.user),
        "  --- what it wrote ---",
        indent(call.responseText ?? "nothing: the call itself failed"),
      );
    }
  }

  return lines.join("\n");
}

function answerLine(answer: EmailVerdict["answer"]): string {
  const fields = answer.defect_fields.length ? answer.defect_fields.join(", ") : "none";
  return `${answer.category} ${answer.status} ${answer.review_reason ?? "no reason"} defect=${answer.has_defect} fields=${fields}`;
}

function quoted(value: string | null): string {
  return value === null ? "(nothing read)" : `"${value}"`;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}
