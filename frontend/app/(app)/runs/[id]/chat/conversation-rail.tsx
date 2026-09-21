import Link from "next/link";

import { Icon } from "@/components/ui/icons";
import type { ChatConversation } from "@/lib/api/chat-thread-schemas";
import { formatWhenShort } from "@/lib/when";

/**
 * Every conversation about this run, and the one that is open.
 *
 * Split out of chat-page.tsx, which is the thread itself. Per-email threads
 * from the rail land in this list too, so after a demo it is mostly those:
 * grouping them is on the phase's own list of what is left.
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
              <span className="mt-0.5 block text-caption text-ink-faint">
                {formatWhenShort(conversation.updatedAt)} · {conversation.turnCount}{" "}
                {conversation.turnCount === 1 ? "turn" : "turns"}
              </span>
            </Link>
          </li>
        ))}
        {conversations.length === 0 ? (
          <li className="px-2.5 py-3 text-caption text-ink-faint">Nothing asked about this run yet.</li>
        ) : null}
      </ul>
    </nav>
  );
}
