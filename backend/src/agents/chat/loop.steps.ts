import { z } from "zod";

import type { ChatToolCall, ChatToolName } from "../../contracts";
import type { TouchedCall } from "./graph";
import { TOOL_NAMES, type ToolOutcome } from "./tools";

/**
 * One step of a turn: what the model may say, and how a finished step reads to
 * it on the next one. Split from loop.ts, which runs the steps.
 */

/** A step's calls run together, so grounding every name in a question costs one model call and not one per name. */
export const MAX_CALLS = 4;

const Call = z.object({
  tool: z.enum(TOOL_NAMES as [ChatToolName, ...ChatToolName[]]),
  args: z.record(z.string(), z.unknown()).default({}),
  /** One sentence on why this call, shown to the reader beside it. */
  thought: z.string().max(400).default(""),
});
export type Call = z.infer<typeof Call>;

/**
 * One flat object, not a discriminated union.
 *
 * The provider refuses `oneOf` at the top level of a tool schema, so the
 * discriminant is a field and the narrowing happens in code. Every field that
 * belongs to only one of the two shapes carries a default, so a step that
 * leaves the other one out still parses and the loop decides what it meant.
 */
export const Step = z.object({
  action: z.enum(["tool", "final"]),
  /** On the first step: one sentence on how the question was read. Shown to the person above the answer. */
  reading: z.string().max(400).default(""),
  /** On a tool step: one to four calls, run together. */
  calls: z.array(Call).max(MAX_CALLS).default([]),
  /** On a final step. */
  answer: z.string().default(""),
  sql_used: z.array(z.string()).default([]),
});
export type Step = z.infer<typeof Step>;

/** A finished call as the loop holds it: what goes on the wire, plus what only the harness reads. */
export interface FinishedCall extends TouchedCall {
  recipe: ChatToolCall["recipe"];
  /** The literal guard refused it. */
  guardRefused: boolean;
  /** It looked and found nothing, or nothing exact. */
  cameUpEmpty: boolean;
  /** A skill it put in front of the agent. */
  skill: string | null;
  /** The text the model reads back. */
  text: string;
  /** What the data returned, which is all the literal guard treats as shown. Empty on a refusal. */
  grounds: string;
}

export function finish(call: Call, outcome: ToolOutcome, durationMs: number): FinishedCall {
  return {
    tool: call.tool,
    args: call.args,
    thought: call.thought,
    ok: outcome.ok,
    preview: outcome.preview,
    sql: outcome.sql ?? null,
    result: outcome.result ?? null,
    durationMs,
    recipe: outcome.recipe ?? null,
    // Carried on the call so the graph is built from what the tools reported,
    // never from what the frontend guesses the answer touched.
    touched: outcome.touched,
    entities: outcome.entities,
    guardRefused: (outcome.ungrounded?.length ?? 0) > 0,
    cameUpEmpty: outcome.empty === true,
    skill: outcome.skill ?? null,
    text: outcome.text,
    grounds: outcome.ok ? (outcome.grounds ?? "") : "",
  };
}

/** Drops what only the harness and the graph needed, so the wire carries the contract and nothing more. */
export function forWire(call: FinishedCall): ChatToolCall {
  const { touched: _t, entities: _e, guardRefused: _g, cameUpEmpty: _c, skill: _s, text: _x, grounds: _d, ...rest } = call;
  return rest;
}

/** What one finished call looks like to the model on the next step. */
export function transcribe(call: FinishedCall): string {
  // A loaded skill is under "Skills for this turn" from the next step on; twice would only crowd the question.
  if (call.skill) return `### you called ${call.tool}\nresult: ${call.preview}. Its text is under "Skills for this turn".`;
  return `### you called ${call.tool}\nwhy: ${call.thought}\nresult${call.ok ? "" : " (it did not work)"}:\n${call.text}`;
}
