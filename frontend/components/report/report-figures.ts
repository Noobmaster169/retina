import type { FieldJudgementView } from "@/lib/api/comparison-schemas";
import type { LlmCall } from "@/lib/api/trace-schemas";

/**
 * The numbers the exported report ends on: what the check covered, and what
 * reading it cost. Pure.
 *
 * Counted from the rows and the calls, never read off a field that claims a
 * total, because the report is the artefact somebody forwards and a number in
 * it has to be one the data supports.
 */

export interface FieldTally {
  total: number;
  same: number;
  differ: number;
  /** Judged, but with nothing on one side to judge against. */
  missing: number;
}

export function tallyFields(fields: FieldJudgementView[]): FieldTally {
  const missing = fields.filter((field) => field.missing).length;
  const differ = fields.filter((field) => !field.missing && !field.same).length;
  return { total: fields.length, same: fields.length - missing - differ, differ, missing };
}

export interface Spend {
  calls: number;
  /** Time inside the model, which is not the wall clock: calls overlap. */
  seconds: number;
  tokens: number;
  /** Null where no call priced itself, so the report says nothing rather than zero. */
  costUsd: number | null;
}

export function spendOf(calls: LlmCall[]): Spend {
  const priced = calls.filter((call) => call.costUsd !== null);
  return {
    calls: calls.length,
    seconds: Math.round(calls.reduce((total, call) => total + call.latencyMs, 0) / 1000),
    tokens: calls.reduce((total, call) => total + (call.inputTokens ?? 0) + (call.outputTokens ?? 0), 0),
    costUsd: priced.length === 0 ? null : priced.reduce((total, call) => total + (call.costUsd ?? 0), 0),
  };
}

export interface PromptUsed {
  step: string;
  promptVersion: string;
  model: string;
}

/**
 * Which prompt each step ran under, once each, in the order the steps first
 * ran. This is the provenance line: two reports of the same email that differ
 * should differ here, and a reader who cannot see it has to take the verdict
 * on trust.
 */
export function promptsUsed(calls: LlmCall[]): PromptUsed[] {
  const seen = new Set<string>();
  const used: PromptUsed[] = [];
  for (const call of calls) {
    const key = `${call.step}:${call.promptVersion}:${call.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    used.push({ step: call.step, promptVersion: call.promptVersion, model: call.model });
  }
  return used;
}

/** "1m 48s", or "8s". A report read by a person, not a chart. */
export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
