"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import { keyOf, type OfferedRef } from "./page-context";
import { rememberedConversation } from "./remembered";

/**
 * What the dock holds across pages: whether it is open, which conversation it
 * is in, what the current page offered, what is pinned, and what was switched
 * off. The turns themselves live in `useChat` inside the panel, which survives
 * navigation because the panel is in the layout.
 *
 * The conversation is remembered in local storage, so a reload resumes it and
 * the Ask Retina page opens on it: the dock and that page are one
 * conversation seen at two widths.
 */

/** A question a page put to the dock, with the skills to answer it under. Taken once by the thread. */
export interface Asked {
  /** Rises per ask, so the thread can tell a repeat of the same words from a re-render. */
  id: number;
  question: string;
  skills: string[];
}

interface DockState {
  open: boolean;
  setOpen(open: boolean): void;
  /** What a page asked on someone's behalf, waiting for the thread to put it. */
  asked: Asked | null;
  /** Opens the dock and puts a question in it, as a control on a page rather than a person typing. */
  ask(question: string, skills?: string[]): void;
  takeAsked(): void;
  conversationId: string | null;
  /** Records the conversation the thread is in without remounting it: the first question sets it mid-flight. */
  setConversationId(id: string | null): void;
  /** Rises when the thread must start over: New, or an older conversation opened from the history. */
  thread: number;
  startNew(): void;
  /** Opens an older conversation in the dock, seeding its turns. */
  openThread(id: string): void;
  page: OfferedRef[];
  pinned: OfferedRef[];
  off: string[];
  suggestions: string[];
  note: string | null;
  /** True while the page is still reading what it offered, so the harness can say so. */
  pageLoading: boolean;
  announce(refs: OfferedRef[], suggestions: string[], note: string | null, loading?: boolean): void;
  toggle(ref: OfferedRef): void;
  pin(ref: OfferedRef): void;
  unpin(ref: OfferedRef): void;
}

const Context = createContext<DockState | null>(null);

const OPEN_KEY = "retina.dock.open";
const CONVERSATION_KEY = "retina.dock.conversation";

function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // A private window keeps nothing; the session still works.
  }
}

/** What was remembered; with nothing remembered, open only where the dock has a column of its own rather than covering the page. */
function remembered(): boolean {
  try {
    const held = window.localStorage.getItem(OPEN_KEY);
    if (held !== null) return held !== "closed";
  } catch {
    // Nothing remembered in a private window; fall through to the width rule.
  }
  return window.matchMedia("(min-width: 1280px)").matches;
}

/** Storage fires for other tabs only; this tab's own change goes through `override` below. */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function DockProvider({ children }: { children: ReactNode }) {
  // The server renders the dock open; the client reads what was remembered
  // without a hydration mismatch, and a choice made on this page wins.
  const rememberedOpen = useSyncExternalStore(subscribe, remembered, () => true);
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? rememberedOpen;
  // Remembered the same way the open state is: the server knows no
  // conversation, the client reads the one it left, and a choice here wins.
  const rememberedId = useSyncExternalStore(subscribe, () => rememberedConversation(stored(CONVERSATION_KEY)), () => null);
  const [chosenId, setChosenId] = useState<string | null | undefined>(undefined);
  const conversationId = chosenId === undefined ? rememberedId : chosenId;
  const [thread, setThread] = useState(0);
  const [page, setPage] = useState<OfferedRef[]>([]);
  const [pinned, setPinned] = useState<OfferedRef[]>([]);
  const [off, setOff] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [asked, setAsked] = useState<Asked | null>(null);

  const setOpen = useCallback((next: boolean) => {
    setOverride(next);
    try {
      window.localStorage.setItem(OPEN_KEY, next ? "open" : "closed");
    } catch {
      // A private window keeps nothing; the dock still opens.
    }
  }, []);

  // The dock is opened here and not by the caller: a question nobody can see
  // being answered is worse than no question.
  const ask = useCallback(
    (question: string, skills: string[] = []) => {
      setAsked((was) => ({ id: (was?.id ?? 0) + 1, question, skills }));
      setOpen(true);
    },
    [setOpen],
  );
  const takeAsked = useCallback(() => setAsked(null), []);

  const announce = useCallback((refs: OfferedRef[], nextSuggestions: string[], nextNote: string | null, loading = false) => {
    setPage(refs);
    setSuggestions(nextSuggestions);
    setNote(nextNote);
    setPageLoading(loading);
    // A new page's refs start attached; what was switched off belonged to the last page.
    setOff([]);
  }, []);

  const setConversationId = useCallback((id: string | null) => {
    setChosenId(id);
    store(CONVERSATION_KEY, id);
  }, []);

  const startNew = useCallback(() => {
    setConversationId(null);
    setThread((was) => was + 1);
  }, [setConversationId]);

  const openThread = useCallback(
    (id: string) => {
      setConversationId(id);
      setThread((was) => was + 1);
    },
    [setConversationId],
  );

  const toggle = useCallback((ref: OfferedRef) => {
    const key = keyOf(ref);
    setOff((was) => (was.includes(key) ? was.filter((k) => k !== key) : [...was, key]));
  }, []);
  const pin = useCallback(
    (ref: OfferedRef) => setPinned((was) => (was.some((r) => keyOf(r) === keyOf(ref)) ? was : [...was, ref])),
    [],
  );
  const unpin = useCallback((ref: OfferedRef) => setPinned((was) => was.filter((r) => keyOf(r) !== keyOf(ref))), []);

  const value = useMemo<DockState>(
    () => ({
      open, setOpen, asked, ask, takeAsked, conversationId, setConversationId, thread, startNew, openThread,
      page, pinned, off, suggestions, note, pageLoading, announce, toggle, pin, unpin,
    }),
    [open, setOpen, asked, ask, takeAsked, conversationId, setConversationId, thread, startNew, openThread, page, pinned, off, suggestions, note, pageLoading, announce, toggle, pin, unpin],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDock(): DockState {
  const held = useContext(Context);
  if (!held) throw new Error("useDock outside the DockProvider");
  return held;
}
