import { z } from "zod";

/**
 * Mirrors backend/src/contracts.chat.ts by hand. A drift fails here, naming
 * the field, instead of reaching the chat as undefined.
 *
 * Named `chat-agent` because `chat-client.ts` is already taken by the phase 4
 * model-comparison passthrough, which is a different thing: that one asks a
 * model for prose, this one asks the analyst about the database.
 */

export const ChatToolName = z.enum(["describe_schema", "run_sql", "get_email", "explain_decision"]);
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

export const ChatTurn = z.object({
  id: z.number().int(),
  role: z.enum(["user", "assistant", "tool"]),
  content: z.string(),
  toolCalls: z.array(ChatToolCall),
  sqlUsed: z.array(z.string()),
  graph: ChatGraph.nullable(),
  proposal: ProposedAction.nullable(),
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

export const ChatAnswer = z.object({
  turn: ChatTurn,
  /** The loop ran out of steps. The answer is what it had, and the page says so. */
  exhausted: z.boolean(),
});
export type ChatAnswer = z.infer<typeof ChatAnswer>;
