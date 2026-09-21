import { type ContextRef } from "./chat-agent-schemas";
import { ChatAnswer, ChatConversation, ChatConversationList, ChatSkillCards, ChatThread, ChatTurnsAfter } from "./chat-thread-schemas";
import { get, parseAs, refusalMessage, request } from "./transport";

export type {
  ChatGraph,
  ChatGraphNode,
  ChatNextMove,
  ChatOutcome as ChatTurnOutcome,
  ChatToolCall,
  ChatToolName,
  ChatTurn,
  ClarifyingQuestion,
  ContextRef,
  ProposedAction,
  SqlResult,
} from "./chat-agent-schemas";
export type { ChatAnswer, ChatConversation, ChatScope, ChatSkillCard, ChatThread } from "./chat-thread-schemas";

/**
 * A turn can take minutes: eight model calls through a proxy that serves about
 * half a request a second. This sits just under the 300 s `maxDuration` the
 * route handler declares, so a slow answer times out here with a message the
 * page can render rather than as a platform error page.
 */
const TURN_TIMEOUT_MS = 290_000;

export type ChatOutcome<T> = { ok: true; value: T } | { ok: false; message: string };

export async function listConversations(runId?: string): Promise<ChatConversation[]> {
  const query = runId ? `?runId=${encodeURIComponent(runId)}` : "";
  return (await get(ChatConversationList, `/chat/conversations${query}`)).conversations;
}

export async function getThread(id: string): Promise<ChatThread | null> {
  try {
    return await get(ChatThread, `/chat/${id}`);
  } catch (error) {
    if (error instanceof Error && /→ 404$/.test(error.message)) return null;
    throw error;
  }
}

export interface NewConversation {
  title?: string;
  runId?: string;
  emailId?: string;
  actor: string;
}

export async function createConversation(body: NewConversation): Promise<ChatOutcome<ChatConversation>> {
  const response = await request("/chat/conversations", { method: "POST", body: JSON.stringify(body) });
  if (!response.ok) return { ok: false, message: await refusalMessage(response) };
  return { ok: true, value: await parseAs(ChatConversation, response, "POST /chat/conversations") };
}

/**
 * Asks one question and waits for the whole answer.
 *
 * Errors come back as a message rather than a throw, because the page renders
 * them inline beside the question that caused them: a failed turn must not
 * lose the conversation a person is in the middle of.
 */
export async function askQuestion(
  id: string,
  content: string,
  actor: string,
  skills: string[] = [],
  context: ContextRef[] = [],
): Promise<ChatOutcome<ChatAnswer>> {
  const response = await request(`/chat/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, actor, skills, context }),
    timeoutMs: TURN_TIMEOUT_MS,
  });
  if (!response.ok) return { ok: false, message: await refusalMessage(response) };
  return { ok: true, value: await parseAs(ChatAnswer, response, `POST /chat/${id}/messages`) };
}

/** The turns newer than one id, tool rows included. What the page polls while its own question is in flight. */
export async function turnsAfter(id: string, after: number): Promise<ChatTurnsAfter> {
  return get(ChatTurnsAfter, `/chat/${id}/turns?after=${after}`);
}

/** The skills a person may pick, for the composer's menu. */
export async function listSkills(): Promise<ChatSkillCards["skills"]> {
  return (await get(ChatSkillCards, "/chat/skills")).skills;
}

export async function deleteConversation(id: string): Promise<ChatOutcome<null>> {
  const response = await request(`/chat/${id}`, { method: "DELETE" });
  if (!response.ok) return { ok: false, message: await refusalMessage(response) };
  return { ok: true, value: null };
}
