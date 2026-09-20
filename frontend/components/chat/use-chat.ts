"use client";

import { useRef, useState } from "react";

import { ChatAnswer, ChatConversation, type ChatTurn } from "@/lib/api/chat-agent-schemas";

import { optimistic, whatLanded } from "./pending-turn";
import { useLiveSteps, type Watched } from "./use-live-steps";

/**
 * Asking a question, watching the steps, and holding what came back.
 *
 * The answered turns are kept here rather than refetched, because a turn costs
 * real model calls and a refetch after every answer would be a second read of
 * something the answer already contained. What is refetched is the turn in
 * flight: while the POST is open the hook polls for rows newer than the
 * question, which is how the steps appear one by one. Those rows are dropped
 * when the answer lands, which carries the same calls in full.
 *
 * A failed turn becomes a message beside the question rather than a thrown
 * error: a conversation somebody is in the middle of must not be lost to one
 * bad request. Stopping aborts the POST; the backend notices the close, ends
 * the turn between steps and stores what it had.
 *
 * A caller that has no conversation yet passes `openWith`, and the first
 * question opens one. On demand rather than on mount, so looking at an email
 * and saying nothing does not leave an empty conversation behind.
 */

export interface NewConversationBody {
  actor: string;
  runId?: string;
  emailId?: string;
  title?: string;
}

export interface ChatState {
  turns: ChatTurn[];
  ask(question: string, skills?: string[]): void;
  stop(): void;
  pending: boolean;
  /** The finished steps of the turn in flight, oldest first. Empty when nothing is pending. */
  steps: ChatTurn[];
  /** When the turn in flight was asked, for the clock on the running step. */
  since: number;
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
  const [since, setSince] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  // Held in refs and not state: the id this hook opened and the request to
  // abort are what the next action needs, not what the page renders.
  const opened = useRef<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  // State and not a ref: it is what the poll is keyed on, so setting it is what
  // starts the poll and changing it is what retires the previous turn's steps.
  const [watching, setWatching] = useState<Watched | null>(null);
  const steps = useLiveSteps(watching);

  function stop(): void {
    inFlight.current?.abort();
  }

  function ask(question: string, skills: string[] = []): void {
    if (pending) return;
    setError(null);
    setPending(true);
    setExhausted(false);
    setSince(Date.now());
    // The question goes up immediately. The backend stores it before it asks
    // the model for exactly the same reason: a person's own words must not
    // wait on an answer.
    setTurns((was) => [...was, optimistic(question)]);

    void (async () => {
      const control = new AbortController();
      inFlight.current = control;
      // Held here and not read off the state below, because the catch needs it
      // and the state set inside this call is not visible to this closure.
      let watched: Watched | null = null;
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

        // The last stored turn is the question just asked, so the steps of this
        // turn are everything after it. Before the first answer there is
        // nothing stored, and 0 is every row of a new conversation.
        const last = turns.filter((turn) => turn.id > 0).at(-1);
        watched = { conversationId: id, after: last?.id ?? 0 };
        setWatching(watched);

        const response = await fetch(`/api/chat/${id}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: question, actor, skills }),
          signal: control.signal,
        });
        if (!response.ok) {
          setError(await refusal(response));
          return;
        }
        const answer = ChatAnswer.parse(await response.json());
        setTurns((was) => [...was, answer.turn]);
        setExhausted(answer.exhausted);
      } catch (cause) {
        // An abort is the person pressing Stop, not a failure. The backend has
        // stored what the turn found; the next read of the thread shows it.
        if (cause instanceof DOMException && cause.name === "AbortError") {
          const landed = watched ? await whatLanded(watched.conversationId, watched.after) : [];
          if (landed.length > 0) setTurns((was) => [...was, ...landed]);
          else setError("Stopped. Anything it had found is kept with the conversation; reopen it to see.");
          return;
        }
        setError(cause instanceof Error ? cause.message : "The answer did not arrive.");
      } finally {
        inFlight.current = null;
        setWatching(null);
        setPending(false);
      }
    })();
  }

  return { turns, ask, stop, pending, steps, since, error, exhausted };
}
