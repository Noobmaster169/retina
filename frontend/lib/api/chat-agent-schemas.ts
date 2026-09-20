import { z } from "zod";

import { SemanticReading } from "./semantic-schemas";

/**
 * Mirrors backend/src/contracts.chat.ts by hand. A drift fails here, naming
 * the field, instead of reaching the chat as undefined.
 *
 * Named `chat-agent` because `chat-client.ts` is already taken by the phase 4
 * model-comparison passthrough, which is a different thing: that one asks a
 * model for prose, this one asks the analyst about the database.
 */

export const ChatToolName = z.enum([
  "run_recipe",
  "find_entity",
  "find_entities",
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

export const SqlResult = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string().nullable())),
  rowCount: z.number().int(),
  /** True when the query returned more than the cap. The page says so rather than implying completeness. */
  truncated: z.boolean(),
  durationMs: z.number().int(),
});
export type SqlResult = z.infer<typeof SqlResult>;

export const ChatToolCall = z.object({
  tool: ChatToolName,
  args: z.record(z.string(), z.unknown()),
  thought: z.string(),
  ok: z.boolean(),
  preview: z.string(),
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

export const ChatGraphNode = z.object({
  id: z.string(),
  kind: z.enum(["question", "tool", "relation", "entity"]),
  label: z.string(),
  count: z.number().int().nullable(),
  /** A node whose count is 0. Drawn faint and never dropped: the dead end is the point. */
  empty: z.boolean(),
});
export type ChatGraphNode = z.infer<typeof ChatGraphNode>;

export const ChatGraph = z.object({
  nodes: z.array(ChatGraphNode),
  edges: z.array(z.object({ from: z.string(), to: z.string() })),
});
export type ChatGraph = z.infer<typeof ChatGraph>;

export const ProposedAction = z.object({
  kind: z.enum(["correct_field", "reclassify", "note"]),
  emailId: z.string(),
  field: z.string().nullable(),
  side: z.enum(["SI", "BL"]).nullable(),
  was: z.string().nullable(),
  is: z.string().nullable(),
  note: z.string().nullable(),
  effect: z.string(),
  /** Never null in phase 10: the card draws both buttons disabled with this sentence under them. */
  blockedReason: z.string().nullable(),
});
export type ProposedAction = z.infer<typeof ProposedAction>;

/**
 * How an answer ended. Not an error state: `none_found` is a correct answer to
 * a question about something that is not in the data, and the page draws it in
 * the same tone as any other.
 */
export const ChatOutcome = z.enum(["answered", "none_found", "partial", "needs_input"]);
export type ChatOutcome = z.infer<typeof ChatOutcome>;

/**
 * One chip under the prose. `prompt` is a full question rather than a label, so
 * clicking it is the same as typing it. An alternative's `thing` and `count`
 * were checked against what the tools returned before the turn was stored;
 * `basis` says whether the model's own knowledge chose it, which the chip marks.
 */
export const ChatNextMove = z.object({
  kind: z.enum(["alternative", "follow_up"]),
  label: z.string(),
  prompt: z.string(),
  thing: z.string().nullable().default(null),
  count: z.number().int().nullable().default(null),
  basis: z.enum(["data", "general_knowledge"]),
});
export type ChatNextMove = z.infer<typeof ChatNextMove>;

export const ClarifyingQuestion = z.object({
  question: z.string(),
  options: z.array(z.string()).min(2).max(5),
});
export type ClarifyingQuestion = z.infer<typeof ClarifyingQuestion>;

export const ChatSkillUse = z.object({
  name: z.string(),
  version: z.number().int(),
  /** `injected` by the harness on something it saw, `loaded` by the agent, `picked` by the person. */
  how: z.enum(["injected", "loaded", "picked"]),
});
export type ChatSkillUse = z.infer<typeof ChatSkillUse>;

export const ChatTurn = z.object({
  id: z.number().int(),
  role: z.enum(["user", "assistant", "tool"]),
  content: z.string(),
  toolCalls: z.array(ChatToolCall),
  sqlUsed: z.array(z.string()),
  graph: ChatGraph.nullable(),
  proposal: ProposedAction.nullable(),
  /** One sentence on how the agent read the question. Empty on a person's turn and on older turns. */
  reading: z.string().default(""),
  skillsUsed: z.array(ChatSkillUse).default([]),
  /** The turn needed SQL the agent wrote itself: a question no recipe covers yet. */
  adhoc: z.boolean().default(false),
  outcome: ChatOutcome.default("answered"),
  /** Where it looked, in the reader's words. Set when the outcome is `none_found` or `partial`. */
  checked: z.array(z.string()).default([]),
  next: z.array(ChatNextMove).default([]),
  clarify: ClarifyingQuestion.nullable().default(null),
  /** Terms this turn had to give a meaning to. Empty on a turn that needed none. */
  semantic: z.array(SemanticReading).default([]),
  createdAt: z.string(),
});
export type ChatTurn = z.infer<typeof ChatTurn>;

export const ChatScope = z.object({
  runId: z.string().nullable(),
  emailId: z.string().nullable(),
  chips: z.array(z.object({ label: z.string(), memory: z.boolean() })),
});
export type ChatScope = z.infer<typeof ChatScope>;

export const ChatConversation = z.object({
  id: z.string(),
  title: z.string().nullable(),
  scope: ChatScope,
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  turnCount: z.number().int(),
});
export type ChatConversation = z.infer<typeof ChatConversation>;

export const ChatConversationList = z.object({ conversations: z.array(ChatConversation) });
export type ChatConversationList = z.infer<typeof ChatConversationList>;

export const ChatThread = z.object({ conversation: ChatConversation, turns: z.array(ChatTurn) });
export type ChatThread = z.infer<typeof ChatThread>;

/**
 * The turns newer than one id, which is what the page polls while a turn runs.
 *
 * The only response that carries `role: "tool"` turns. Each is one finished
 * call, drawn as a line of the live steps and dropped when the assistant turn
 * lands, which carries the same calls in full.
 */
export const ChatTurnsAfter = z.object({ turns: z.array(ChatTurn) });
export type ChatTurnsAfter = z.infer<typeof ChatTurnsAfter>;

/** One skill as the composer's menu lists it. The body is never sent: it is for the agent, not the reader. */
export const ChatSkillCard = z.object({
  name: z.string(),
  version: z.number().int(),
  when: z.string(),
});
export type ChatSkillCard = z.infer<typeof ChatSkillCard>;

export const ChatSkillCards = z.object({ skills: z.array(ChatSkillCard) });
export type ChatSkillCards = z.infer<typeof ChatSkillCards>;

export const ChatAnswer = z.object({
  turn: ChatTurn,
  /** The loop ran out of steps. The answer is what it had, and the page says so. */
  exhausted: z.boolean(),
});
export type ChatAnswer = z.infer<typeof ChatAnswer>;
