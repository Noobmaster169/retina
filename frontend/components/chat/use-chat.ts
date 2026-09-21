"use client";

import { useRef, useState } from "react";

import { type ChatTurn, type ContextRef } from "@/lib/api/chat-agent-schemas";
import { ChatAnswer, ChatConversation, ChatProgress } from "@/lib/api/chat-thread-schemas";

import { optimistic, whatLanded } from "./pending-turn";
import { eventFrames } from "./sse";

/**
 * Asking a question, watching it being answered, and holding what came back.
 *
 * The POST is a stream. What used to be a wait with a poll beside it is now one
 * connection carrying both: `progress` frames while the turn runs, then one
 * `answer` frame with the same body the blocking form returns. The answered
 * turns are kept here rather than refetched, because a turn costs real model
 * calls and the answer already contained everything a refetch would ask for.
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
  ask(question: string, skills?: string[], context?: ContextRef[]): void;
  stop(): void;
  pending: boolean;
  /** Where the turn in flight has got to. Null when nothing is pending, and before its first frame. */
  progress: ChatProgress | null;
  /** When the turn in flight was asked, for the clock beside the status. */
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

/** A frame's body. A frame that is not JSON is a broken stream, not a failed turn, and is skipped. */
function payload(data: string): unknown {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return null;
  }
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
  /** Told the id of a conversation the first question opened, for a caller that shows it. */
  onOpened?(id: string): void;
}): ChatState {
  const { conversationId, openWith, actor, initial, onOpened } = options;
  const [turns, setTurns] = useState<ChatTurn[]>(initial);
  const [pending, setPending] = useState(false);
  const [since, setSince] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [progress, setProgress] = useState<ChatProgress | null>(null);
  // Held in refs and not state: the id this hook opened and the request to
  // abort are what the next action needs, not what the page renders.
  const opened = useRef<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  function stop(): void {
    inFlight.current?.abort();
  }

  function ask(question: string, skills: string[] = [], context: ContextRef[] = []): void {
    if (pending) return;
    setError(null);
    setPending(true);
    setExhausted(false);
    setProgress(null);
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
      let asked: { id: string; after: number } | null = null;
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
          onOpened?.(id);
        }

        // The last stored turn is the question just asked, so anything this turn
        // writes is after it. Only the stop path reads this now.
        asked = { id, after: turns.filter((turn) => turn.id > 0).at(-1)?.id ?? 0 };

        const response = await fetch(`/api/chat/${id}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "text/event-stream" },
          body: JSON.stringify({ content: question, actor, skills, context }),
          signal: control.signal,
        });
        if (!response.ok) {
          setError(await refusal(response));
          return;
        }
        if (!response.body) {
          setError("The answer came back with no body.");
          return;
        }

        let ended = false;
        for await (const frame of eventFrames(response.body)) {
          if (frame.event === "progress") {
            const parsed = ChatProgress.safeParse(payload(frame.data));
            if (parsed.success) setProgress(parsed.data);
            continue;
          }
          if (frame.event === "answer") {
            const parsed = ChatAnswer.safeParse(payload(frame.data));
            if (!parsed.success) {
              setError("The answer arrived outside the contract. Reopen the conversation to read what was stored.");
              ended = true;
              continue;
            }
            setTurns((was) => [...was, parsed.data.turn]);
            setExhausted(parsed.data.exhausted);
            ended = true;
            continue;
          }
          if (frame.event === "failure") {
            const said = payload(frame.data) as { error?: unknown } | null;
            setError(typeof said?.error === "string" ? said.error : "The answer did not arrive.");
            ended = true;
          }
        }
        // The stream closed without saying how it ended, which is the connection
        // going away mid-turn rather than the turn failing. The backend stores
        // what it had either way.
        if (!ended) setError("The answer stopped arriving. Reopen the conversation to see what was stored.");
      } catch (cause) {
        // An abort is the person pressing Stop, not a failure. The backend has
        // stored what the turn found; the next read of the thread shows it.
        if (cause instanceof DOMException && cause.name === "AbortError") {
          const landed = asked ? await whatLanded(asked.id, asked.after) : [];
          if (landed.length > 0) setTurns((was) => [...was, ...landed]);
          else setError("Stopped. Anything it had found is kept with the conversation; reopen it to see.");
          return;
        }
        setError(cause instanceof Error ? cause.message : "The answer did not arrive.");
      } finally {
        inFlight.current = null;
        setProgress(null);
        setPending(false);
      }
    })();
  }

  return { turns, ask, stop, pending, progress, since, error, exhausted };
}
