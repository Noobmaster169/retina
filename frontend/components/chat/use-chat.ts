"use client";

import { useRef, useState } from "react";

import { ChatAnswer, ChatConversation, type ChatTurn } from "@/lib/api/chat-agent-schemas";

/**
 * Asking a question, and holding what came back.
 *
 * The turns are kept here rather than refetched, because a turn costs real
 * model calls and a refetch after every answer would be a second read of
 * something the answer already contained. A failed turn becomes a message
 * beside the question rather than a thrown error: a conversation somebody is
 * in the middle of must not be lost to one bad request.
 *
 * A caller that has no conversation yet passes `openWith`, and the first
 * question opens one. On demand rather than on mount, so looking at an email
 * and saying nothing does not leave an empty conversation behind, and so the
 * rail needs no effect to get itself ready.
 */

export interface NewConversationBody {
  actor: string;
  runId?: string;
  emailId?: string;
  title?: string;
}

export interface ChatState {
  turns: ChatTurn[];
  ask(question: string): void;
  pending: boolean;
  error: string | null;
  /** True when the last answer ran out of its step budget, which the turn also says on itself. */
  exhausted: boolean;
}

async function refusal(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const message = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
  return typeof message === "string" ? message : `The answer failed with ${response.status}.`;
}

/** Opens a conversation and returns it, or the reason it could not be opened. */
export async function openConversation(
  body: NewConversationBody,
): Promise<{ ok: true; conversation: ChatConversation } | { ok: false; message: string }> {
  const response = await fetch("/api/chat/conversations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { ok: false, message: await refusal(response) };
  return { ok: true, conversation: ChatConversation.parse(await response.json()) };
}

export function useChat(options: {
  /** The conversation being read, when the page already knows which one. */
  conversationId: string | null;
  /** How to open one on the first question, for a caller that has none. */
  openWith?: NewConversationBody;
  actor: string;
  initial: ChatTurn[];
}): ChatState {
  const { conversationId, openWith, actor, initial } = options;
  const [turns, setTurns] = useState<ChatTurn[]>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  // Held in a ref and not state: the id this hook opened is not something the
  // rail renders, only something the next question needs.
  const opened = useRef<string | null>(null);

  function ask(question: string): void {
    if (pending) return;
    setError(null);
    setPending(true);
    setExhausted(false);
    // The question goes up immediately. The backend stores it before it asks
    // the model for exactly the same reason: a person's own words must not
    // wait on an answer.
    setTurns((was) => [
      ...was,
      {
        id: -Date.now(),
        role: "user",
        content: question,
        toolCalls: [],
        sqlUsed: [],
        graph: null,
        proposal: null,
        reading: "",
        skillsUsed: [],
        adhoc: false,
        outcome: "answered",
        checked: [],
        next: [],
        clarify: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    void (async () => {
      try {
        let id = conversationId ?? opened.current;
        if (!id) {
          if (!openWith) {
            setError("There is no conversation to ask in.");
            return;
          }
          const start = await openConversation(openWith);
          if (!start.ok) {
            setError(start.message);
            return;
          }
          id = start.conversation.id;
          opened.current = id;
        }

        const response = await fetch(`/api/chat/${id}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: question, actor }),
        });
        if (!response.ok) {
          setError(await refusal(response));
          return;
        }
        const answer = ChatAnswer.parse(await response.json());
        setTurns((was) => [...was, answer.turn]);
        setExhausted(answer.exhausted);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The answer did not arrive.");
      } finally {
        setPending(false);
      }
    })();
  }

  return { turns, ask, pending, error, exhausted };
}
