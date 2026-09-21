import { type ChatTurn } from "@/lib/api/chat-agent-schemas";
import { ChatTurnsAfter } from "@/lib/api/chat-thread-schemas";

/**
 * The gap between asking and having an answer.
 *
 * Two things live in it: the turn drawn for a question the backend has not
 * answered yet, and what the backend turns out to have stored for one the
 * person stopped. Split from use-chat.ts, which is the asking itself.
 */

/** How long to keep looking for the stopped turn's row, and how often. A model call in flight takes seconds, not minutes. */
const RECOVER_FOR_MS = 12_000;
const RECOVER_EVERY_MS = 1500;

/**
 * What the backend stored for a turn the person stopped.
 *
 * Stopping aborts the POST, so the answer never comes back over it. The loop
 * reads the stop between steps and stores what it had, and a model call already
 * in flight is left to finish, so the row can land a few seconds after the
 * button was pressed. Without this the page would say "stopped" and show
 * nothing, including in the common case where a whole answer was written a
 * second later and the person would have to reload to find it.
 *
 * Bounded, and reads only. If nothing has landed by the end of it the caller
 * says so, and the row is still there in the thread next time it is opened.
 */
export async function whatLanded(conversationId: string, after: number): Promise<ChatTurn[]> {
  const until = Date.now() + RECOVER_FOR_MS;
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, RECOVER_EVERY_MS));
    try {
      const response = await fetch(`/api/chat/${conversationId}/turns?after=${after}`);
      if (!response.ok) continue;
      const landed = ChatTurnsAfter.parse(await response.json()).turns.filter((turn) => turn.role === "assistant");
      if (landed.length > 0) return landed;
    } catch {
      // A failed read here costs another attempt, and the row is in the thread either way.
    }
  }
  return [];
}

export function optimistic(question: string): ChatTurn {
  return {
    id: -Date.now(),
    role: "user",
    content: question,
    toolCalls: [],
    sqlUsed: [],
    graph: null,
    proposal: null,
    emailDraft: null,
    reading: "",
    skillsUsed: [],
    adhoc: false,
    outcome: "answered",
    checked: [],
    next: [],
    clarify: null,
    semantic: [],
    context: [],
    createdAt: new Date().toISOString(),
  };
}
