"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { type ChatTurn } from "@/lib/api/chat-agent-schemas";

import { type AskOptions, type Live, QUIET } from "./chat-live";
import { run } from "./chat-turn-run";
import { mergeTurns } from "./merge-turns";
import { optimistic } from "./pending-turn";

/**
 * Every conversation this session has open, held above the routes.
 *
 * It used to be held inside whichever component was showing the thread, and
 * two of them show it: the dock, and the Ask Retina page, which the shell
 * swaps for each other. So asking a question and then going to another page
 * unmounted the state the answer was arriving into, and coming back mounted a
 * fresh one seeded from a server render taken before the answer existed. The
 * answer was never lost, only never shown until a reload, and the two of them
 * disagreeing is what made a thread flicker.
 *
 * Here instead, mounted once by the shell. Navigating cannot unmount it, so a
 * turn keeps streaming into the same place while the person is elsewhere and
 * is simply there when they come back. A conversation already read is drawn
 * from what is held before the server is asked again, which is what makes
 * moving between two of them immediate.
 */

interface Store {
  held: Record<string, Live>;
  /** Hands the server's copy over. What is held wins where the server has not caught up: see mergeTurns. */
  seed(key: string, turns: ChatTurn[]): void;
  ask(options: AskOptions): void;
  stop(key: string): void;
}

const Context = createContext<Store | null>(null);

export function useChatStore(): Store {
  const store = useContext(Context);
  if (!store) throw new Error("useChatStore was called outside ChatStoreProvider");
  return store;
}

export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const [held, setHeld] = useState<Record<string, Live>>({});
  // The requests to abort, which are what the next action needs and never what
  // anything renders. A ref, so a turn in flight is not a reason to rerender.
  const inFlight = useRef<Record<string, AbortController>>({});
  const change = useCallback((key: string, how: (was: Live) => Live) => {
    setHeld((all) => ({ ...all, [key]: how(all[key] ?? QUIET) }));
  }, []);

  const rename = useCallback((from: string, to: string) => {
    if (from === to) return;
    setHeld((all) => {
      const moving = all[from];
      if (!moving) return all;
      const rest = { ...all };
      delete rest[from];
      const into = rest[to];
      rest[to] = into ? { ...moving, turns: mergeTurns(into.turns, moving.turns) } : moving;
      return rest;
    });
    const control = inFlight.current[from];
    if (control) {
      delete inFlight.current[from];
      inFlight.current[to] = control;
    }
  }, []);

  const seed = useCallback((key: string, turns: ChatTurn[]) => {
    setHeld((all) => {
      const was = all[key];
      const merged = mergeTurns(turns, was?.turns ?? []);
      // Where the answer is the same list, say nothing: a new object here would
      // rerender every open thread on every server render.
      if (was && sameTurns(was.turns, merged)) return all;
      return { ...all, [key]: { ...(was ?? QUIET), turns: merged } };
    });
  }, []);

  const stop = useCallback((key: string) => {
    inFlight.current[key]?.abort();
  }, []);

  const ask = useCallback(
    (options: AskOptions) => {
      // A turn already running for this conversation is the one authority on
      // whether another may start, and it is a ref rather than state for
      // exactly that: it is true the instant `run` takes the key, not a render
      // later.
      if (inFlight.current[options.key]) return;
      change(options.key, (was) => ({
        ...was,
        error: null,
        pending: true,
        exhausted: false,
        progress: null,
        calls: [],
        since: Date.now(),
        // The question goes up at once. The backend stores it before it asks
        // the model, for exactly the same reason.
        turns: [...was.turns, optimistic(options.question)],
      }));
      void run(options, { change, rename, inFlight });
    },
    [change, rename],
  );

  const store = useMemo<Store>(() => ({ held, seed, ask, stop }), [held, seed, ask, stop]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

function sameTurns(a: ChatTurn[], b: ChatTurn[]): boolean {
  return a.length === b.length && a.every((turn, at) => turn.id === b[at].id && turn.content === b[at].content);
}
