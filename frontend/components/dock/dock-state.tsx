"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import { keyOf, type OfferedRef } from "./page-context";

/**
 * What the dock holds across pages: whether it is open, which conversation it
 * is in, what the current page offered, what is pinned, and what was switched
 * off. The turns themselves live in `useChat` inside the panel, keyed on the
 * conversation, which is what survives navigation because the panel is in the
 * layout.
 */

interface DockState {
  open: boolean;
  setOpen(open: boolean): void;
  conversationId: string | null;
  setConversationId(id: string | null): void;
  page: OfferedRef[];
  pinned: OfferedRef[];
  off: string[];
  suggestions: string[];
  note: string | null;
  announce(refs: OfferedRef[], suggestions: string[], note: string | null): void;
  toggle(ref: OfferedRef): void;
  pin(ref: OfferedRef): void;
  unpin(ref: OfferedRef): void;
}

const Context = createContext<DockState | null>(null);

const OPEN_KEY = "retina.dock.open";

function remembered(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== "closed";
  } catch {
    return true;
  }
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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [page, setPage] = useState<OfferedRef[]>([]);
  const [pinned, setPinned] = useState<OfferedRef[]>([]);
  const [off, setOff] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const setOpen = useCallback((next: boolean) => {
    setOverride(next);
    try {
      window.localStorage.setItem(OPEN_KEY, next ? "open" : "closed");
    } catch {
      // A private window keeps nothing; the dock still opens.
    }
  }, []);

  const announce = useCallback((refs: OfferedRef[], nextSuggestions: string[], nextNote: string | null) => {
    setPage(refs);
    setSuggestions(nextSuggestions);
    setNote(nextNote);
    // A new page's refs start attached; what was switched off belonged to the last page.
    setOff([]);
  }, []);

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
    () => ({ open, setOpen, conversationId, setConversationId, page, pinned, off, suggestions, note, announce, toggle, pin, unpin }),
    [open, setOpen, conversationId, page, pinned, off, suggestions, note, announce, toggle, pin, unpin],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDock(): DockState {
  const held = useContext(Context);
  if (!held) throw new Error("useDock outside the DockProvider");
  return held;
}
