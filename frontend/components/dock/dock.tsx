"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import { z } from "zod";

import { PendingBody } from "@/components/chat/pending-body";
import { Composer } from "@/components/chat/composer";
import { PendingFoot } from "@/components/chat/pending-foot";
import { Suggestions } from "@/components/chat/suggestions";
import { Turn } from "@/components/chat/turn";
import { useChat } from "@/components/chat/use-chat";
import type { ChatTurn } from "@/lib/api/chat-agent-schemas";
import { ChatThread } from "@/lib/api/chat-thread-schemas";
import { parsedFetcher } from "@/lib/poll";

import { ContextStrip } from "./context-strip";
import { DockHeader, type DockView } from "./dock-header";
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
  const [view, setView] = useState<DockView>("thread");
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
      <PendingAsk
        onAsk={(question, skills) => {
          setView("thread");
          chat.ask(question, skills, refs);
        }}
      />
      <DockHeader
        title={title ?? chat.turns[0]?.content ?? "A new question"}
        view={view}
        onView={setView}
        canStartNew={chat.turns.length > 0 || dock.conversationId !== null}
        wide={wide}
      />

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
        {chat.pending ? <PendingBody progress={chat.progress} calls={chat.calls} /> : null}
        {chat.error ? (
          <p className="rounded-md border border-fault-tint bg-fault-tint px-3 py-2 text-small text-fault">{chat.error}</p>
        ) : null}
        <div ref={foot} />
      </div>
      )}

      {/* Offered, then what goes with it, then the box you type in. */}
      <Suggestions
        items={chat.turns.length === 0 && !chat.pending ? dock.suggestions : []}
        onAsk={(question) => chat.ask(question, [], refs)}
        dense
      />
      {chat.pending ? <PendingFoot progress={chat.progress} since={chat.since} /> : null}
      <ContextStrip />
      <Composer
        onAsk={(question, skills) => chat.ask(question, skills, refs)}
        onStop={chat.stop}
        pending={chat.pending}
        placeholder={refs.length ? "Ask about what you are looking at" : "Ask about the inbox"}
        dense
      />
    </>
  );
}

/**
 * Puts a question a page asked on someone's behalf, once.
 *
 * A component and not an effect in the thread, because taking the ask has to
 * happen on whichever render first has both a question and a thread to put it
 * in, and an id it has already taken is the only thing that tells a new
 * question from another render of the same one.
 */
function PendingAsk({ onAsk }: { onAsk(question: string, skills: string[]): void }) {
  const dock = useDock();
  const asked = dock.asked;
  const taken = useRef(0);
  useEffect(() => {
    if (!asked || taken.current === asked.id) return;
    taken.current = asked.id;
    dock.takeAsked();
    onAsk(asked.question, asked.skills);
  }, [asked, dock, onAsk]);
  return null;
}
