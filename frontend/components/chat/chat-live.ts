import { type ChatToolCall, type ChatTurn, type ContextRef } from "@/lib/api/chat-agent-schemas";
import { type ChatProgress } from "@/lib/api/chat-thread-schemas";

import { type NewConversationBody } from "./conversation";

/** What one conversation is doing, as everything that reads or writes it sees. */
export interface Live {
  turns: ChatTurn[];
  pending: boolean;
  progress: ChatProgress | null;
  calls: ChatToolCall[];
  since: number;
  error: string | null;
  exhausted: boolean;
}

/** A conversation nothing has happened in. Shared, so an untouched thread is one object and not one per read. */
export const QUIET: Live = { turns: [], pending: false, progress: null, calls: [], since: 0, error: null, exhausted: false };

export interface AskOptions {
  /** The conversation, or the draft bucket a first question is asked in. */
  key: string;
  conversationId: string | null;
  openWith?: NewConversationBody;
  actor: string;
  question: string;
  skills: string[];
  context: ContextRef[];
  onOpened?(id: string): void;
}

/** What one running turn needs of the store it writes into. */
export interface Wiring {
  change(key: string, how: (was: Live) => Live): void;
  rename(from: string, to: string): void;
  inFlight: { current: Record<string, AbortController> };
}
