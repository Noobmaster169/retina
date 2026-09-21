"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";

import { Composer } from "@/components/chat/composer";
import { Suggestions } from "@/components/chat/suggestions";
import { Turn } from "@/components/chat/turn";
import { openConversation, useChat } from "@/components/chat/use-chat";

import { DockSync } from "@/components/dock/dock-sync";

import { ConversationRail } from "./conversation-rail";
import { Opening } from "./opening";
import { Empty, Pending } from "./thread-parts";
import { TopBar } from "@/components/shell/top-bar";
import type { ChatConversation, ChatThread } from "@/lib/api/chat-thread-schemas";

/**
 * The conversation, wide.
 *
 * The dock is where most questions are asked, because the question a person
 * has is usually about the thing in front of them. This page is the same
 * conversation with room to read a long answer, and every other conversation
 * beside it. `DockSync` keeps the dock in the one opened here.
 */

/** There are no accounts in this build; a reviewer types their name once. This is the chat's. */
const ACTOR = "the analyst";

/**
 * How the question box travels from the middle of the page to its foot. Long
 * enough to read as one movement and not a jump, short enough that it is over
 * before the first tool call comes back. Eased out, because the box is coming
 * to rest against the bottom of the page and should look like it.
 */
const SETTLE = { duration: 0.42, ease: [0.22, 1, 0.36, 1] } as const;

const SUGGESTIONS = [
  "Which client had the most mismatches in the latest run, and on which field?",
  "Which of the seven fields differs most often?",
  "How many emails needed a person, by reason?",
  "Which spellings were judged to be the same port?",
];

interface ChatPageProps {
  runId: string;
  conversations: ChatConversation[];
  thread: ChatThread | null;
}

export function ChatPage({ runId, conversations, thread }: ChatPageProps) {
  const router = useRouter();
  const chat = useChat({ conversationId: thread?.conversation.id ?? null, actor: ACTOR, initial: thread?.turns ?? [] });
  const foot = useRef<HTMLDivElement>(null);

  // Nothing has been asked here yet. `turns` holds the person's own question
  // the moment they send it, before any answer, so this turns false on the
  // keystroke that sends rather than when the model comes back: the box starts
  // travelling while they are still looking at what they typed.
  const opening = chat.turns.length === 0 && !chat.pending;
  const scopeWords = thread?.conversation.scope.chips.map((chip) => chip.label).join(" and ") ?? "every run";

  // A new answer is long, and the thing a person wants to read is its top, not
  // its bottom. Scrolling to the end of the list puts the question they just
  // asked at the top of the view, with the answer under it.
  useEffect(() => {
    foot.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.turns.length]);

  async function start(): Promise<void> {
    const opened = await openConversation({ actor: ACTOR, runId });
    if (opened.ok) router.push(`/runs/${runId}/chat?c=${opened.conversation.id}`);
  }

  return (
    <>
      <DockSync conversationId={thread?.conversation.id ?? null} />
      <ConversationRail conversations={conversations} runId={runId} openId={thread?.conversation.id ?? null} onNew={start} />

      <div className="flex min-w-0 grow flex-col">
        <TopBar crumbs={[{ label: "Ask Retina" }, { label: thread?.conversation.title ?? "A new question" }]}>
          {thread ? (
            <span className="flex h-[26px] items-center gap-1.5">
              {thread.conversation.scope.chips.map((chip) => (
                <span
                  key={chip.label}
                  className={`inline-flex h-[21px] items-center rounded-sm border border-hairline bg-canvas px-2 font-mono text-mono-xs ${
                    chip.memory ? "text-review" : "text-ink-secondary"
                  }`}
                >
                  {chip.label}
                </span>
              ))}
            </span>
          ) : null}
        </TopBar>

        <div className="min-h-0 grow overflow-y-auto px-6 py-5">
          {thread === null ? (
            <Empty onNew={start} />
          ) : (
            <div className="mx-auto max-w-[900px] space-y-6">
              {chat.turns.map((turn, index) => (
                <Turn
                  key={turn.id}
                  turn={turn}
                  exhausted={chat.exhausted && index === chat.turns.length - 1}
                  onAsk={chat.ask}
                  answered={index < chat.turns.length - 1 || chat.pending}
                />
              ))}
              {chat.pending ? <Pending progress={chat.progress} calls={chat.calls} since={chat.since} /> : null}
              {chat.error ? (
                <p className="rounded-md border border-fault-tint bg-fault-tint px-3 py-2 text-small text-fault">
                  {chat.error}
                </p>
              ) : null}
              <div ref={foot} />
            </div>
          )}
        </div>

        {/*
         * An empty conversation puts the question box in the middle of the
         * page, where the only thing to do is ask, and travels it to the foot
         * once there is a thread to read above it. The box itself never
         * unmounts: `layout` animates the one element from where it was to
         * where it now belongs, so the movement is the box moving and not one
         * box disappearing while another appears. The spacer under it is what
         * centres it, and its going is what sends the box down.
         */}
        {thread ? (
          <>
            <AnimatePresence>{opening ? <Opening key="opening" scope={scopeWords} /> : null}</AnimatePresence>
            <motion.div layout transition={SETTLE} className="shrink-0">
              <Suggestions items={opening ? SUGGESTIONS : []} onAsk={chat.ask} />
              <Composer
                onAsk={chat.ask}
                onStop={chat.stop}
                pending={chat.pending}
                placeholder="Ask about this inbox"
                seam={!opening}
              />
            </motion.div>
            {opening ? <motion.div layout transition={SETTLE} className="min-h-0 grow" /> : null}
          </>
        ) : null}
      </div>
    </>
  );
}
