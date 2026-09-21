"use client";

import { useCallback, useEffect, useId, useRef } from "react";

import { type ChatToolCall, type ChatTurn, type ContextRef } from "@/lib/api/chat-agent-schemas";
import { type ChatProgress } from "@/lib/api/chat-thread-schemas";

import { type NewConversationBody } from "./conversation";
import { QUIET } from "./chat-live";
import { useChatStore } from "./chat-store";

export { openConversation, type NewConversationBody } from "./conversation";

/**
 * One conversation, as a component reads and writes it.
 *
 * The state itself is not here: it is in `chat-store.tsx`, mounted once by the
 * shell, because the two components that show a thread are swapped for each
 * other by navigation and whichever one held it was being unmounted mid-answer.
 * This is the view onto it, and its shape is what it always was, so a caller
 * cannot tell the difference except that its thread now survives.
 *
 * `initial` is the server's copy and is handed to the store rather than held:
 * what the store has wins wherever the server has not caught up, which is how
 * an answer that landed a moment ago is not thrown away by a stale render.
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
  const store = useChatStore();

  // A caller with no conversation yet asks into a bucket of its own, which the
  // store renames to the conversation the first question opens. Stable for the
  // life of the component, so two docks could never share one draft.
  const draft = useId();
  const key = conversationId ?? `draft:${draft}`;

  // The server's copy, handed over whenever it changes. Not in a render: the
  // store is shared, and writing to it while rendering would be one component
  // changing what another is in the middle of drawing.
  const seed = store.seed;
  const sameInitial = useRef<ChatTurn[] | null>(null);
  useEffect(() => {
    if (sameInitial.current === initial) return;
    sameInitial.current = initial;
    if (initial.length > 0) seed(key, initial);
  }, [seed, key, initial]);

  const ask = useCallback(
    (question: string, skills: string[] = [], context: ContextRef[] = []) => {
      store.ask({ key, conversationId, openWith, actor, question, skills, context, onOpened });
    },
    [store, key, conversationId, openWith, actor, onOpened],
  );

  const stop = useCallback(() => store.stop(key), [store, key]);

  const live = store.held[key] ?? QUIET;
  return { ...live, ask, stop };
}
