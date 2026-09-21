"use client";

import { useRef, useState } from "react";

import { type ChatToolCall, type ChatTurn, type ContextRef } from "@/lib/api/chat-agent-schemas";
import { type ChatProgress } from "@/lib/api/chat-thread-schemas";

import { type NewConversationBody, openConversation, refusal } from "./conversation";
import { optimistic, whatLanded } from "./pending-turn";
import { turnEvents } from "./turn-stream";

export { openConversation, type NewConversationBody } from "./conversation";

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

export interface ChatState {
  turns: ChatTurn[];
  ask(question: string, skills?: string[], context?: ContextRef[]): void;
  stop(): void;
  pending: boolean;
  /** Where the turn in flight has got to. Null when nothing is pending, and before its first frame. */
  progress: ChatProgress | null;
  /** The calls the turn in flight has finished, oldest first. Emptied when the answer lands, which carries them itself. */
  calls: ChatToolCall[];
  /** When the turn in flight was asked, for the clock beside the status. */
  since: number;
  error: string | null;
  /** True when the last answer ran out of its step budget, which the turn also says on itself. */
  exhausted: boolean;
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
  const [calls, setCalls] = useState<ChatToolCall[]>([]);
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
    setCalls([]);
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
        for await (const event of turnEvents(response.body)) {
          if (event.kind === "progress") {
            setProgress(event.progress);
            continue;
          }
          if (event.kind === "calls") {
            setCalls((was) => [...was, ...event.calls]);
            continue;
          }
          ended = true;
          if (event.kind === "answer") {
            // The turn and the end of the wait are set together, in one render.
            // Left to the `finally`, the finished answer is drawn under the
            // half-written one for a frame and the page reads as if it answered
            // twice.
            setTurns((was) => [...was, event.answer.turn]);
            setExhausted(event.answer.exhausted);
            setProgress(null);
            setCalls([]);
            setPending(false);
            continue;
          }
          setError(event.message);
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
        // Already done on the answer path. This is for every other way out:
        // a refusal, an abort, a stream that stopped saying anything.
        inFlight.current = null;
        setProgress(null);
        setCalls([]);
        setPending(false);
      }
    })();
  }

  return { turns, ask, stop, pending, progress, calls, since, error, exhausted };
}
