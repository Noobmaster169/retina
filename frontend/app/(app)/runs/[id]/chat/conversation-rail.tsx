import Link from "next/link";

import { Icon } from "@/components/ui/icons";
import type { ChatConversation } from "@/lib/api/chat-thread-schemas";
import { formatWhenShort } from "@/lib/when";

/**
 * Every conversation, newest first, and the one that is open.
 *
 * Split out of chat-page.tsx, which is the thread itself. Not scoped to a run
 * since phase 13: the dock's history is this same list, and a conversation
 * opened on a company page belongs to no run. Each row says which run it was
 * opened on, where it was.
 */

export function ConversationRail({
  conversations,
  runId,
  openId,
  onNew,
}: {
  conversations: ChatConversation[];
  runId: string;
  openId: string | null;
  onNew(): void;
}) {
  return (
    <nav aria-label="Conversations" className="flex w-60 shrink-0 flex-col border-r border-hairline bg-surface">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline px-4">
        <Icon name="chat" size={15} className="text-ink" />
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Conversations</h2>
        <span className="grow" />
        <button
          type="button"
          onClick={onNew}
          className="h-[26px] rounded-sm border border-hairline bg-canvas px-2.5 text-caption text-ink-secondary hover:border-hairline-strong"
        >
          New
        </button>
      </div>
      <ul className="min-h-0 grow overflow-y-auto p-2">
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <Link
              href={`/runs/${runId}/chat?c=${conversation.id}`}
              aria-current={conversation.id === openId ? "page" : undefined}
              className={`block rounded-md px-2.5 py-2 ${conversation.id === openId ? "bg-active" : "hover:bg-sunken"}`}
            >
              <span className="block truncate text-small text-ink">{conversation.title ?? "A new question"}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-caption text-ink-faint">
                {formatWhenShort(conversation.updatedAt)} · {conversation.turnCount} {conversation.turnCount === 1 ? "turn" : "turns"}
                {conversation.scope.chips.slice(0, 1).map((chip) => (
                  <span key={chip.label} className="rounded-xs bg-sunken px-1 font-mono text-mono-xs text-ink-tertiary">
                    {chip.label}
                  </span>
                ))}
              </span>
            </Link>
          </li>
        ))}
        {conversations.length === 0 ? (
          <li className="px-2.5 py-3 text-caption text-ink-faint">Nothing asked yet.</li>
        ) : null}
      </ul>
    </nav>
  );
}
