"use client";

import useSWR from "swr";
import { z } from "zod";

import { ChatConversation } from "@/lib/api/chat-thread-schemas";
import { parsedFetcher } from "@/lib/poll";
import { formatWhenShort } from "@/lib/when";

import { useDock } from "./dock-state";

/**
 * Every conversation, newest first, in the dock. Not scoped to a run: a
 * question asked on a company page belongs to no run, and a person looking
 * for what they asked yesterday does not remember which run was in context.
 */

const List = z.object({ conversations: z.array(ChatConversation) });

export function DockHistory({ onOpen }: { onOpen(): void }) {
  const dock = useDock();
  const { data, error } = useSWR("/api/chat/conversations", parsedFetcher(List), { keepPreviousData: true });
  const conversations = data?.conversations ?? [];

  return (
    <ul className="min-h-0 grow overflow-y-auto p-2" aria-label="Conversations">
      {conversations.map((conversation) => {
        const here = conversation.id === dock.conversationId;
        return (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => {
                if (!here) dock.openThread(conversation.id);
                onOpen();
              }}
              aria-current={here ? "true" : undefined}
              className={`block w-full rounded-md px-2.5 py-2 text-left ${here ? "bg-accent-tint" : "hover:bg-sunken"}`}
            >
              <span className={`block truncate text-small ${here ? "text-accent" : "text-ink"}`}>{conversation.title ?? "A new question"}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-caption text-ink-faint">
                {formatWhenShort(conversation.updatedAt)} · {conversation.turnCount} {conversation.turnCount === 1 ? "turn" : "turns"}
                {conversation.scope.chips.slice(0, 1).map((chip) => (
                  <span key={chip.label} className="rounded-xs bg-sunken px-1 font-mono text-mono-xs text-ink-tertiary">
                    {chip.label}
                  </span>
                ))}
              </span>
            </button>
          </li>
        );
      })}
      {data && conversations.length === 0 ? <li className="px-2.5 py-3 text-caption text-ink-faint">Nothing asked yet.</li> : null}
      {error ? <li className="px-2.5 py-3 text-caption text-fault">The history could not be read.</li> : null}
    </ul>
  );
}
