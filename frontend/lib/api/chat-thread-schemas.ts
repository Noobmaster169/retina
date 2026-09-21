import { z } from "zod";

import { ChatTurn } from "./chat-agent-schemas";

/**
 * The conversation around the turns: its scope, the thread, what a poll and
 * an answer return, and the skill cards. Split from chat-agent-schemas.ts,
 * which holds one turn and everything inside it, so each file stays under the
 * line rule. Both mirror backend/src/contracts.chat.ts by hand.
 */

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

/** Mirrors ChatPhase in backend/src/contracts.chat.ts. */
export const ChatPhase = z.enum(["reading", "looking", "writing"]);
export type ChatPhase = z.infer<typeof ChatPhase>;

/**
 * One `progress` frame of a streamed turn. Mirrors ChatProgress in
 * backend/src/contracts.chat.ts.
 *
 * Every field is what is known so far rather than what changed, so the page
 * replaces its state with each frame and never appends to it. `answer` can come
 * back shorter than the frame before: the CLI validates its own structured
 * output and rewrites the whole object when it fails, which a reader sees as
 * the answer starting again.
 */
export const ChatProgress = z.object({
  step: z.number().int().min(1),
  phase: ChatPhase,
  reading: z.string().default(""),
  answer: z.string().default(""),
  tools: z.array(z.string()).default([]),
});
export type ChatProgress = z.infer<typeof ChatProgress>;
