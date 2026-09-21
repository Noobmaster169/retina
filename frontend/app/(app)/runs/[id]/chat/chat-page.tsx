"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { Composer } from "@/components/chat/composer";
import { Markdown } from "@/components/chat/markdown";
import { StatusLine } from "@/components/chat/status-line";
import { Turn } from "@/components/chat/turn";
import { openConversation, useChat } from "@/components/chat/use-chat";

import { DockSync } from "@/components/dock/dock-sync";

import { ConversationRail } from "./conversation-rail";
import { TopBar } from "@/components/shell/top-bar";
import type { ChatConversation, ChatProgress, ChatThread } from "@/lib/api/chat-thread-schemas";

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
              {chat.pending ? <Pending progress={chat.progress} since={chat.since} /> : null}
              {chat.error ? (
                <p className="rounded-md border border-fault-tint bg-fault-tint px-3 py-2 text-small text-fault">
                  {chat.error}
                </p>
              ) : null}
              <div ref={foot} />
            </div>
          )}
        </div>

        {thread ? (
          <Composer
            onAsk={chat.ask}
            onStop={chat.stop}
            pending={chat.pending}
            suggestions={chat.turns.length === 0 ? SUGGESTIONS : []}
            placeholder="Ask about this inbox"
          />
        ) : null}
      </div>
    </>
  );
}

/**
 * A turn in flight: one line for what it is doing, and the answer as it is
 * written.
 *
 * The skeleton is only there until the first words are. Once the model is
 * writing, the prose itself is the thing standing for the wait, which is the
 * whole point: the answer is what the person came for, and they can start
 * reading it several seconds before it is finished.
 */
function Pending({ progress, since }: { progress: ChatProgress | null; since: number }) {
  return (
    <div className="space-y-3">
      <StatusLine progress={progress} since={since} />
      {progress?.answer ? (
        <Markdown text={progress.answer} />
      ) : (
        <>
          <div className="h-4 w-2/3 rounded-xs bg-sunken" />
          <div className="h-4 w-1/2 rounded-xs bg-sunken" />
        </>
      )}
    </div>
  );
}

function Empty({ onNew }: { onNew(): void }) {
  return (
    <div className="mx-auto max-w-[560px] pt-16 text-center">
      <h1 className="font-display text-display font-normal tracking-[-0.01em]">Ask Retina</h1>
      <p className="mt-1 text-body text-ink-tertiary">
        A conversation that reads the whole model and answers from it, with the query it ran shown under every answer.
      </p>
      <button
        type="button"
        onClick={onNew}
        className="mt-5 h-9 rounded-md bg-ink px-4 text-strong font-medium text-ink-inverse"
      >
        Start a conversation
      </button>
    </div>
  );
}
