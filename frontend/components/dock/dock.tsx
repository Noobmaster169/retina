"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import { z } from "zod";

import { Composer } from "@/components/chat/composer";
import { LiveCalls } from "@/components/chat/live-calls";
import { Markdown } from "@/components/chat/markdown";
import { StatusLine } from "@/components/chat/status-line";
import { Turn } from "@/components/chat/turn";
import { useChat } from "@/components/chat/use-chat";
import { Icon, type IconName } from "@/components/ui/icons";
import type { ChatTurn } from "@/lib/api/chat-agent-schemas";
import { ChatThread } from "@/lib/api/chat-thread-schemas";
import { parsedFetcher } from "@/lib/poll";

import { ContextStrip } from "./context-strip";
import { DockHistory } from "./dock-history";
import { useDock } from "./dock-state";
import { attached } from "./page-context";

/**
 * The 380px dock on the right of every page. Mounted once, in the layout, so
 * a question asked on one page is still being answered on the next. It resumes
 * the conversation it was left in, and its History lists every other one.
 *
 * Below 1280px it is a sheet over the page rather than a column, which keeps
 * the panes from moving when it opens.
 */

/** There are no accounts in this build; a reviewer types their name once. This is the dock's. */
const ACTOR = "the reviewer";

const ICON_BUTTON =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-ink-secondary transition-colors duration-150 hover:bg-active hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent";

function IconButton({ name, label, on = false, onClick, disabled = false }: { name: IconName; label: string; on?: boolean; onClick(): void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      className={`${ICON_BUTTON} ${on ? "bg-accent-tint text-accent" : ""}`}
    >
      <Icon name={name} size={13} />
    </button>
  );
}

const Held = z.object({ thread: ChatThread.nullable() });

const noop = () => () => undefined;

/** False during hydration, when the store still answers with the server's empty snapshot. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/** `runId` is the run the shell has in context: the one in the URL, or the newest, which is where the wide page lives. */
export function Dock({ runId }: { runId: string | null }) {
  const dock = useDock();
  // The remembered conversation is read from local storage, which the server
  // cannot see; seeding before hydration would resume nothing every time.
  const hydrated = useHydrated();
  if (!dock.open || !hydrated) return null;
  return (
    <aside
      aria-label="Ask Retina"
      className="fixed inset-y-0 right-0 z-30 flex w-[380px] shrink-0 flex-col border-l border-hairline bg-surface shadow-overlay xl:static xl:shadow-none"
    >
      {/* Keyed on the thread counter, so New and an opened history item start fresh while the first question's own conversation does not remount it. */}
      <DockSeed key={dock.thread} runId={runId} />
    </aside>
  );
}

/**
 * Reads the remembered conversation once, then hands its turns to the thread.
 * `useChat` seeds from `initial` on mount, so the thread is rendered only when
 * there is something to seed it with, or nothing to fetch.
 */
function DockSeed({ runId }: { runId: string | null }) {
  const dock = useDock();
  // Captured at mount: the id the first question sets afterwards must not refetch.
  const [seedId] = useState(dock.conversationId);
  const { data, error } = useSWR(seedId ? `/api/chat/${seedId}` : null, parsedFetcher(Held));
  if (seedId && !data && !error) {
    return (
      <div className="flex grow items-center justify-center text-caption text-ink-faint">Picking up where you left off</div>
    );
  }
  // A conversation nobody holds any more starts the dock fresh rather than failing it.
  const initial: ChatTurn[] = data?.thread?.turns ?? [];
  return <DockThread initial={initial} title={data?.thread?.conversation.title ?? null} runId={runId} />;
}

function DockThread({ initial, title, runId }: { initial: ChatTurn[]; title: string | null; runId: string | null }) {
  const dock = useDock();
  const [view, setView] = useState<"thread" | "history">("thread");
  const chat = useChat({
    conversationId: dock.conversationId,
    openWith: { actor: ACTOR, runId: runId ?? undefined },
    actor: ACTOR,
    initial,
    onOpened: dock.setConversationId,
  });
  const foot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    foot.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.turns.length]);

  const refs = attached(dock.page, dock.pinned, dock.off).map(({ kind, id }) => ({ kind, id }));
  const wide = runId ? `/runs/${runId}/chat${dock.conversationId ? `?c=${dock.conversationId}` : ""}` : null;

  return (
    <>
      <header className="shrink-0 border-b border-hairline">
        <div className="flex h-14 items-center gap-2.5 px-[18px]">
          <Icon name="chat" size={15} className="text-accent" />
          <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Ask Retina</h2>
          <span className="grow" />
          <button
            type="button"
            onClick={() => dock.setOpen(false)}
            aria-label="Close the dock"
            className="flex h-6 w-6 items-center justify-center rounded-sm text-ink-faint hover:bg-active hover:text-ink-secondary"
          >
            <Icon name="panel" size={14} />
          </button>
        </div>
        {/* The conversation's own line: its title, and the three things one can do with it. */}
        <div className="flex h-9 items-center gap-1 px-[18px] pb-1.5">
          <span className="min-w-0 grow truncate text-caption text-ink-tertiary">
            {view === "history" ? "Every conversation" : (title ?? chat.turns[0]?.content ?? "A new question")}
          </span>
          <IconButton
            name="clock"
            label={view === "history" ? "Back to the conversation" : "History"}
            on={view === "history"}
            onClick={() => setView((was) => (was === "history" ? "thread" : "history"))}
          />
          <IconButton name="plus" label="New conversation" onClick={dock.startNew} disabled={chat.turns.length === 0 && !dock.conversationId} />
          {wide ? (
            <Link href={wide} title="Open wide" aria-label="Open wide" className={ICON_BUTTON}>
              <Icon name="expand" size={13} />
            </Link>
          ) : null}
        </div>
      </header>

      {view === "history" ? (
        <DockHistory onOpen={() => setView("thread")} />
      ) : (
      <div className="min-h-0 grow space-y-5 overflow-y-auto px-[18px] py-4">
        {dock.note && chat.turns.length === 0 ? <p className="text-small leading-[19px] text-ink-secondary">{dock.note}</p> : null}
        {chat.turns.map((turn, index) => (
          <Turn
            key={turn.id}
            turn={turn}
            exhausted={chat.exhausted && index === chat.turns.length - 1}
            onAsk={(question) => chat.ask(question, [], refs)}
            answered={index < chat.turns.length - 1 || chat.pending}
          />
        ))}
        {chat.pending ? (
          <div className="space-y-3">
            <StatusLine progress={chat.progress} since={chat.since} />
            <LiveCalls calls={chat.calls} />
            {chat.progress?.answer ? <Markdown text={chat.progress.answer} /> : <div className="h-4 w-2/3 rounded-xs bg-sunken" />}
          </div>
        ) : null}
        {chat.error ? (
          <p className="rounded-md border border-fault-tint bg-fault-tint px-3 py-2 text-small text-fault">{chat.error}</p>
        ) : null}
        <div ref={foot} />
      </div>
      )}

      <ContextStrip />
      <Composer
        onAsk={(question, skills) => chat.ask(question, skills, refs)}
        onStop={chat.stop}
        pending={chat.pending}
        suggestions={chat.turns.length === 0 ? dock.suggestions : []}
        placeholder={refs.length ? "Ask about what you are looking at" : "Ask about the inbox"}
        dense
      />
    </>
  );
}
