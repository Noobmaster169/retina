import { z } from "zod";

import {
  ChatGraph,
  ChatNextMove,
  ChatOutcome,
  ChatSkillUse,
  ChatToolCall,
  ClarifyingQuestion,
  ProposedAction,
} from "./contracts.chat-agent";

/**
 * A conversation, and the turns it carries.
 *
 * What one turn is made of is contracts.chat-agent.ts. This is the shape around
 * it: who opened the conversation, what it can see, how a question is sent and
 * how the thread is read back.
 */

export const ChatRole = z.enum(["user", "assistant", "tool"]);
export type ChatRole = z.infer<typeof ChatRole>;

export const ChatTurn = z.object({
  id: z.number().int(),
  role: ChatRole,
  content: z.string(),
  toolCalls: z.array(ChatToolCall),
  sqlUsed: z.array(z.string()),
  graph: ChatGraph.nullable(),
  proposal: ProposedAction.nullable(),
  /** One sentence on how the agent read the question. Empty on a person's turn and on turns from before the harness. */
  reading: z.string().default(""),
  skillsUsed: z.array(ChatSkillUse).default([]),
  /** The turn needed SQL the agent wrote itself: a question no recipe covers yet. */
  adhoc: z.boolean().default(false),
  outcome: ChatOutcome.default("answered"),
  /** Where it looked, in the reader's words. Set when the outcome is `none_found` or `partial`. */
  checked: z.array(z.string()).default([]),
  next: z.array(ChatNextMove).default([]),
  clarify: ClarifyingQuestion.nullable().default(null),
  createdAt: z.string(),
});
export type ChatTurn = z.infer<typeof ChatTurn>;

/** What the rail's `Reading` chips name: exactly what this conversation can see. */
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
 * The only response that carries `role = "tool"` turns. Each one is a single
 * finished call, drawn as a line of the live steps and dropped when the
 * assistant turn lands, which carries the same calls in full.
 */
export const ChatTurnsAfter = z.object({ turns: z.array(ChatTurn) });
export type ChatTurnsAfter = z.infer<typeof ChatTurnsAfter>;

export const NewConversation = z.object({
  title: z.string().max(200).optional(),
  runId: z.uuid().optional(),
  emailId: z.string().max(120).optional(),
  actor: z.string().min(1).max(120),
});
export type NewConversation = z.infer<typeof NewConversation>;

export const NewMessage = z.object({
  content: z.string().min(1).max(4000),
  actor: z.string().min(1).max(120),
  /**
   * Skills the person picked in the composer, injected exactly as an
   * event-injected one is. A nudge and not a mode: the agent still follows
   * CHAT.md, and a name the registry does not know is refused at the route
   * rather than silently ignored.
   */
  skills: z.array(z.string().max(60)).max(3).default([]),
});
export type NewMessage = z.infer<typeof NewMessage>;

/** One skill as the composer's menu lists it. The body is never sent: it is for the agent, not the reader. */
export const ChatSkillCard = z.object({
  name: z.string(),
  version: z.number().int(),
  when: z.string(),
});
export type ChatSkillCard = z.infer<typeof ChatSkillCard>;

export const ChatSkillCards = z.object({ skills: z.array(ChatSkillCard) });
export type ChatSkillCards = z.infer<typeof ChatSkillCards>;

/** What one turn answers with. The page draws these four in this order. */
export const ChatAnswer = z.object({
  turn: ChatTurn,
  /** Set when the loop ran out of steps: the answer is what it had, and the page says so. */
  exhausted: z.boolean(),
});
export type ChatAnswer = z.infer<typeof ChatAnswer>;
