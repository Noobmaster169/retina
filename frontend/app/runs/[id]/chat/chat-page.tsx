"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { Composer } from "@/components/chat/composer";
import { Turn } from "@/components/chat/turn";
import { openConversation, useChat } from "@/components/chat/use-chat";
import { AppShell } from "@/components/shell/app-shell";
import { TopBar } from "@/components/shell/top-bar";
import { Icon } from "@/components/ui/icons";
import type { ChatConversation, ChatThread } from "@/lib/api/chat-agent-schemas";
import { formatWhenShort } from "@/lib/when";

/**
 * A question about the whole inbox rather than one email.
 *
 * The rail on the email page is where most questions are asked, because the
 * question a person has is usually about the thing in front of them. This is
 * the other kind.
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
    <AppShell active="chat" runId={runId} counts={{}}>
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
                <Turn key={turn.id} turn={turn} exhausted={chat.exhausted && index === chat.turns.length - 1} />
              ))}
              {chat.pending ? <Pending /> : null}
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
            pending={chat.pending}
            suggestions={chat.turns.length === 0 ? SUGGESTIONS : []}
            placeholder="Ask about this inbox"
          />
        ) : null}
      </div>
    </AppShell>
  );
}

/** No streaming, so a pending turn shows the shape of what is coming and the time it is taking. */
function Pending() {
  return (
    <div className="space-y-3">
      <div className="h-[240px] rounded-xl border border-hairline bg-surface">
        <div className="flex h-11 items-center border-b border-hairline px-4 text-caption text-ink-faint">
          What it touched
        </div>
        <div className="flex h-[196px] items-center justify-center text-small text-ink-faint">
          It is reading. The graph is drawn when the turn finishes.
        </div>
      </div>
      <div className="h-4 w-2/3 rounded-xs bg-sunken" />
      <div className="h-4 w-1/2 rounded-xs bg-sunken" />
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

function ConversationRail({
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
