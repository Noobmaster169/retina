import { z } from "zod";

import {
  ChatNextMove,
  ChatOutcome,
  type ChatToolCall,
  type ChatToolName,
  ClarifyingQuestion,
  EmailDraft,
  type GroundedThing,
  type SemanticReading,
} from "../../contracts";
import type { TouchedCall } from "./graph";
import type { ResolvedMention } from "./mentions";
import { MAX_MOVES } from "./next-moves";
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
  reading: z
    .string()
    .max(400)
    .default("")
    .describe("On the first step only: one plain sentence on how the question was read, which run, which things, what is counted."),
  /** On a tool step: one to four calls, run together. */
  calls: z.array(Call).max(MAX_CALLS).default([]),
  /**
   * On a final step. The description is the style rule the model reads beside
   * the field, where a constrained output follows it far more reliably than a
   * paragraph of prose above the schema.
   */
  answer: z
    .string()
    .default("")
    .describe(
      "The answer, in Markdown, for a person who runs a business and not the database, written as a colleague would say it. Lead with the answer. Six sentences at most, where a whole list counts as one and a heading as none. Three or more things of one kind (companies, ports, emails, fields, reasons) go in a bulleted list after a blank line, one per line, at most eight; never run them together in a sentence with commas. A short heading only when the answer has distinct parts. Never reproduce a result set; the rows are shown under the answer, so give the number that matters and say what it means, though when the question asks which things, listing them is the answer. Bold the one number or name the reader came for. Link each resolved thing once, the first time you name it, as [name](entity:<the id a tool printed for it>). Name things as the data spells them and the run by the first eight characters of its id. No table or column names; say resolved companies, not core.entities. No greeting, no preamble, no offer to do more, no closing question, no dashes as punctuation.",
    ),
  sql_used: z.array(z.string()).default([]),
  /** How the answer ended. `none_found` obliges `checked`; `needs_input` obliges `clarify`. */
  outcome: ChatOutcome.default("answered"),
  /** The places looked, in the reader's words: resolved ports, subject lines, bodies, sender domains. */
  checked: z.array(z.string()).default([]),
  /**
   * Up to four chips under the prose. Every alternative is checked against what
   * the tools returned before it is stored, so one invented here is removed and
   * the answer still stands.
   */
  next: z.array(ChatNextMove).max(MAX_MOVES).default([]),
  clarify: ClarifyingQuestion.nullable().default(null),
  /**
   * On a final step that drafts a reply to the sender. `to` must be the
   * `from:` address a `get_email` call returned on this turn, never composed:
   * the card that renders this opens a real mail client against it.
   */
  email_draft: EmailDraft.nullable().default(null),
});
export type Step = z.infer<typeof Step>;

/** A finished call as the loop holds it: what goes on the wire, plus what only the harness reads. */
export interface FinishedCall extends TouchedCall {
  recipe: ChatToolCall["recipe"];
  /** The literal guard refused it. */
  guardRefused: boolean;
  /** It looked and found nothing, or nothing exact. */
  cameUpEmpty: boolean;
  /** It returned candidates of more than one kind. */
  ambiguous: boolean;
  /** A skill it put in front of the agent. */
  skill: string | null;
  /** The resolved things it put in front of the agent, for the conversation to remember by name. */
  things: GroundedThing[];
  /** The ids it printed, which are the only ones the answer may link to. */
  mentions: ResolvedMention[];
  /** The text the model reads back. */
  text: string;
  /** What the data returned, which is all the literal guard treats as shown. Empty on a refusal. */
  grounds: string;
  /** The terms it gave a meaning to, which the turn carries to the page. */
  semantic: SemanticReading[];
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
    ambiguous: outcome.ambiguous === true,
    skill: outcome.skill ?? null,
    things: outcome.things ?? [],
    mentions: outcome.mentions ?? [],
    text: outcome.text,
    grounds: outcome.ok ? (outcome.grounds ?? "") : "",
    semantic: outcome.semantic ?? [],
  };
}

/** Drops what only the harness and the graph needed, so the wire carries the contract and nothing more. */
export function forWire(call: FinishedCall): ChatToolCall {
  const { touched: _t, entities: _e, guardRefused: _g, cameUpEmpty: _c, ambiguous: _a, skill: _s, things: _n, mentions: _i, text: _x, grounds: _d, semantic: _m, ...rest } = call;
  return rest;
}

/** What one finished call looks like to the model on the next step. */
export function transcribe(call: FinishedCall): string {
  // A loaded skill is under "Skills for this turn" from the next step on; twice would only crowd the question.
  if (call.skill) return `### you called ${call.tool}\nresult: ${call.preview}. Its text is under "Skills for this turn".`;
  return `### you called ${call.tool}\nwhy: ${call.thought}\nresult${call.ok ? "" : " (it did not work)"}:\n${call.text}`;
}
