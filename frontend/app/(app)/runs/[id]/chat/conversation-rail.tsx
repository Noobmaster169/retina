"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { Icon } from "@/components/ui/icons";
import type { ChatConversation } from "@/lib/api/chat-thread-schemas";
import { formatWhenShort } from "@/lib/when";

/**
 * Every conversation, newest first, and the one that is open.
 *
 * Split out of chat-page.tsx, which is the thread itself. Not scoped to a run
 * since phase 13: the dock's history is this same list, and a conversation
 * opened on a company page belongs to no run.
 */

/**
 * A conversation being named, which takes as long as the first answer does.
 *
 * The row used to sit on "A new question" until the page was loaded again, so
 * the one conversation a person was actually in was the one the rail was
 * wrong about. Three dots say the name is coming; the name itself is the
 * server's to write, and it fades in when it arrives.
 */
function Naming() {
  return (
    <span className="flex h-[18px] items-center gap-[3px]" aria-label="Naming this conversation">
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          aria-hidden="true"
          className="h-[3px] w-[3px] rounded-full bg-ink-faint"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: dot * 0.16 }}
        />
      ))}
    </span>
  );
}

export function ConversationRail({
  conversations,
  runId,
  openId,
  namingId,
  onNew,
}: {
  conversations: ChatConversation[];
  runId: string;
  openId: string | null;
  /** The conversation whose name is being written right now, if one is. */
  namingId: string | null;
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
              {/* Faded and not truncated. An ellipsis is a mark saying there
                  is more, and a column of them says it about every row at
                  once; a title that softens at the edge says the same thing
                  and keeps the last letters readable. The title is already cut
                  to a label by agents/chat/title.ts, so this is the rare long
                  one rather than the shape of the list.

                  Keyed by what it says, so the dots giving way to a name is a
                  crossfade and not a substitution nobody sees happen. */}
              <AnimatePresence mode="wait" initial={false}>
                {conversation.id === namingId ? (
                  <motion.span
                    key="naming"
                    className="block"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.14 }}
                  >
                    <Naming />
                  </motion.span>
                ) : (
                  <motion.span
                    key={conversation.title ?? "unnamed"}
                    className="block overflow-hidden whitespace-nowrap text-small text-ink mask-[linear-gradient(to_right,#000_calc(100%-24px),transparent)]"
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.26, ease: "easeOut" }}
                  >
                    {conversation.title ?? "A new question"}
                  </motion.span>
                )}
              </AnimatePresence>
              {/* The date alone. How many turns it took and which run it was
                  opened on are facts about the conversation, not ways to
                  recognise it, and they crowded out the one that is. */}
              <span className="mt-0.5 block text-caption text-ink-faint">{formatWhenShort(conversation.updatedAt)}</span>
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
