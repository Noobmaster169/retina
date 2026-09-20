import { z } from "zod";

import { ComparisonField } from "./contracts.scoring";

/**
 * What the agent produced on one turn: the tools it called, the picture of what
 * it touched, how the answer ended, and what it offers next.
 *
 * Split from contracts.chat.ts, which carries the conversation those turns sit
 * in. Both are re-exported from contracts.ts and mirrored by hand in
 * frontend/lib/api/chat-agent-schemas.ts.
 *
 * The SQL and the rows are part of the answer, not debug output. The product's
 * claim is that it did not make the number up, and the evidence for that claim
 * is the query beside the sentence, which is why every turn carries it and why
 * docs/design/screen-blueprints.md section 10 refuses to collapse the block.
 */

export const ChatToolName = z.enum([
  "run_recipe",
  "find_entity",
  "list_entities",
  "get_entity",
  "search_emails",
  "profile_column",
  "load_skill",
  "run_sql",
  "describe_schema",
  "get_email",
  "explain_decision",
]);
export type ChatToolName = z.infer<typeof ChatToolName>;

/** What `run_sql` hands back. Truncated before it reaches either the model or the page, identically. */
export const SqlResult = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string().nullable())),
  rowCount: z.number().int(),
  /** True when the query returned more than the cap, so the page can say so rather than implying completeness. */
  truncated: z.boolean(),
  durationMs: z.number().int(),
});
export type SqlResult = z.infer<typeof SqlResult>;

/** One tool the agent called on this turn, with enough of the result to show what came back. */
export const ChatToolCall = z.object({
  tool: ChatToolName,
  args: z.record(z.string(), z.unknown()),
  /** The agent's own sentence on why it reached for this tool. */
  thought: z.string(),
  ok: z.boolean(),
  /** A short rendering of the result, or the error where the call failed. */
  preview: z.string(),
  /** Set only for `run_sql`, and the whole reason the tool block is worth drawing. */
  sql: z.string().nullable(),
  result: SqlResult.nullable(),
  durationMs: z.number().int(),
  /** Set for `run_recipe`: the standard query that ran, the skill it belongs to, and its arguments. */
  recipe: z
    .object({ name: z.string(), version: z.number().int().default(1), skill: z.string(), params: z.record(z.string(), z.unknown()) })
    .nullable()
    .default(null),
});
export type ChatToolCall = z.infer<typeof ChatToolCall>;

/**
 * The result graph: what the agent touched, drawn beside what it said.
 *
 * Built from what the loop reported, never inferred in the frontend. A tool
 * that returned nothing still gets a node with a 0, because showing the dead
 * end is the point (docs/design/ontology-patterns.md section 3.6).
 */
export const ChatGraphNode = z.object({
  id: z.string(),
  /** The four columns of the layered layout, left to right. */
  kind: z.enum(["question", "tool", "relation", "entity"]),
  label: z.string(),
  /** The divided count segment on an aggregate node. Null where a count means nothing. */
  count: z.number().int().nullable(),
  /** True for a node whose count is 0: drawn faint, never dropped. */
  empty: z.boolean(),
});
export type ChatGraphNode = z.infer<typeof ChatGraphNode>;

export const ChatGraph = z.object({
  nodes: z.array(ChatGraphNode),
  edges: z.array(z.object({ from: z.string(), to: z.string() })),
});
export type ChatGraph = z.infer<typeof ChatGraph>;

/**
 * An action the conversation would take, drawn before anything is written.
 *
 * This is the contract docs/phases/phase-08-handover.md has carried open for
 * three phases, settled here and specified in docs/03-infra-deep.md section
 * 5.5. Phase 10's scope says write tools are out, so the agent may propose one
 * and nothing may apply one: `blockedReason` is always set and the card's two
 * buttons are drawn disabled with that sentence under them. Phase 11 builds
 * the apply path against this exact shape.
 */
export const ProposedAction = z.object({
  /** A subset of core.review_actions.kind: the three a conversation could ever justify. */
  kind: z.enum(["correct_field", "reclassify", "note"]),
  emailId: z.string(),
  field: ComparisonField.nullable(),
  side: z.enum(["SI", "BL"]).nullable(),
  was: z.string().nullable(),
  is: z.string().nullable(),
  note: z.string().nullable(),
  /** What applying it would do, in the words the card shows under the values. */
  effect: z.string(),
  /**
   * Why neither button may be pressed. Never null in phase 10. A phase that
   * builds the apply path sets it only when the email has no review case to
   * address the write to, which is still every un-escalated email.
   */
  blockedReason: z.string().nullable(),
});
export type ProposedAction = z.infer<typeof ProposedAction>;

/**
 * How an answer ended: it answered, it found nothing, it found part of it, or
 * it needs the person to choose between readings.
 *
 * Not an error state. `none_found` is a correct answer to a question about
 * something that is not in the data, and the page draws it in the same tone as
 * any other: what was checked, and what is there instead.
 */
export const ChatOutcome = z.enum(["answered", "none_found", "partial", "needs_input"]);
export type ChatOutcome = z.infer<typeof ChatOutcome>;

/**
 * One thing the reader can do next, written as a question the chat can answer.
 *
 * A chip's `prompt` is a full question rather than a label, so clicking it is
 * the same as typing it and needs no route of its own. An `alternative` names
 * a thing that is in the data with the number that was read beside it, and
 * `next-moves.ts` drops any whose thing and number did not come back from a
 * tool on that turn. `basis` says whether the model's own knowledge chose it,
 * which the chip marks: relating Jakarta to the ports that are there is
 * geography, not a fact about this mailbox.
 */
export const ChatNextMove = z.object({
  kind: z.enum(["alternative", "follow_up"]),
  label: z.string().max(60),
  prompt: z.string().max(300),
  /** The value or name it is about, exactly as the data spells it. Null on a follow-up. */
  thing: z.string().nullable().default(null),
  count: z.number().int().nullable().default(null),
  basis: z.enum(["data", "general_knowledge"]),
});
export type ChatNextMove = z.infer<typeof ChatNextMove>;

/** What the agent asks back when the data makes an ambiguity real. The options are candidates its tools returned. */
export const ClarifyingQuestion = z.object({
  question: z.string(),
  options: z.array(z.string()).min(2).max(5),
});
export type ClarifyingQuestion = z.infer<typeof ClarifyingQuestion>;

/**
 * A resolved thing a turn grounded, remembered by name for the turns after it.
 *
 * By name and not by id. Ids survive a refresh since phase 10f, so this is a
 * choice rather than a constraint: a name is what the person says on the next
 * turn, grounding it again is one indexed lookup, and it goes on meaning the
 * right thing after a merge without anything following a tombstone.
 */
export const GroundedThing = z.object({
  kind: z.string(),
  canonical: z.string(),
  spellings: z.array(z.string()).default([]),
});
export type GroundedThing = z.infer<typeof GroundedThing>;

/** A skill that was in front of the agent on a turn, at which version, and how it got there. */
export const ChatSkillUse = z.object({
  name: z.string(),
  version: z.number().int(),
  /** `injected` by the harness on something it saw, `loaded` by the agent, `picked` by the person. */
  how: z.enum(["injected", "loaded", "picked"]),
});
export type ChatSkillUse = z.infer<typeof ChatSkillUse>;
