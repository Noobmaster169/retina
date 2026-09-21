"use client";

import { useRouter } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";

import { Composer } from "@/components/chat/composer";
import { Suggestions } from "@/components/chat/suggestions";
import { Turn } from "@/components/chat/turn";
import { openConversation, useChat } from "@/components/chat/use-chat";

import { DockSync } from "@/components/dock/dock-sync";

import { ConversationRail } from "./conversation-rail";
import { Opening } from "./opening";
import { Seed } from "./seed";
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

/** The store is where a thread's turns live, so nothing is seeded from a prop. Stable, or the effect that hands it over never settles. */
const NO_TURNS: never[] = [];

/**
 * How the question box travels from the middle of the page to its foot. Long
 * enough to read as one movement and not a jump, short enough that it is over
 * before the first tool call comes back. Eased out, because the box is coming
 * to rest against the bottom of the page and should look like it.
 */
const SETTLE = { duration: 0.42, ease: [0.22, 1, 0.36, 1] } as const;

/**
 * Three, and short. They are an offer and not a menu: a fourth row of them
 * pushed the question box off the middle of the page, and a person reading
 * four long sentences is choosing between them rather than asking their own.
 */
const SUGGESTIONS = [
  "Which client had the most mismatches?",
  "Which of the seven fields differs most often?",
  "How many emails needed a person, by reason?",
];

interface ChatPageProps {
  runId: string;
  conversations: ChatConversation[];
  /** Which conversation the address names, or the newest there is. */
  openId: string | null;
  /**
   * The server's copy of that thread, still arriving. Never awaited before the
   * page draws: the turns come from the store, which already has them for any
   * conversation this session has read, and this merges in behind.
   */
  thread: Promise<ChatThread | null> | null;
}

export function ChatPage({ runId, conversations, openId, thread }: ChatPageProps) {
  const router = useRouter();
  const conversation = conversations.find((one) => one.id === openId) ?? null;
  const chat = useChat({ conversationId: openId, actor: ACTOR, initial: NO_TURNS });
  const foot = useRef<HTMLDivElement>(null);

  // Nothing has ever been asked here, so the box sits in the middle. `turns`
  // holds the person's own question the moment they send it, so this turns
  // false on the keystroke that sends rather than when the model comes back:
  // the box starts travelling while they are still looking at what they typed.
  //
  // The turn count comes from the list and
  // not from the turns, which arrive after the page draws: without it a
  // conversation with a thread showed the centred opening for the moment
  // before its turns landed, and the box travelled down as they did.
  const opening = chat.turns.length === 0 && !chat.pending && (conversation?.turnCount ?? 0) === 0;
  const scopeWords = conversation?.scope.chips.map((chip) => chip.label).join(" and ") ?? "every run";

  // A conversation is named from its first question, by the server, and the
  // rail is drawn from a server render: until this, the one conversation a
  // person was actually in was the one row the rail was wrong about, and it
  // stayed wrong until the page was loaded again. The row shows dots from the
  // keystroke that sends, and this fetches the name that replaces them.
  //
  // Twice, deliberately. The name is written before the model is called, so
  // the first of these usually has it; the second is for when that race goes
  // the other way, and both stop the moment a name exists.
  const naming = conversation !== null && conversation.title === null && chat.turns.length > 0;
  useEffect(() => {
    if (naming) router.refresh();
  }, [naming, chat.pending, router]);

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
      <DockSync conversationId={openId} />
      {thread ? (
        <Suspense fallback={null}>
          <Seed id={openId} thread={thread} />
        </Suspense>
      ) : null}
      <ConversationRail
        conversations={conversations}
        runId={runId}
        openId={openId}
        namingId={naming ? openId : null}
        onNew={start}
      />

      <div className="flex min-w-0 grow flex-col">
        <TopBar crumbs={[{ label: "Ask Retina" }, { label: conversation?.title ?? "A new question" }]}>
          {conversation ? (
            <span className="flex h-[26px] items-center gap-1.5">
              {conversation.scope.chips.map((chip) => (
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
          {conversation === null ? (
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
        {conversation ? (
          <>
            <AnimatePresence>{opening ? <Opening key="opening" scope={scopeWords} /> : null}</AnimatePresence>
            <motion.div layout transition={SETTLE} className="shrink-0">
              <Suggestions items={opening ? SUGGESTIONS : []} onAsk={chat.ask} centred={opening} />
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
