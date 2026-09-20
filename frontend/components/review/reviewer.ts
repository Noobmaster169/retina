"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Who is reviewing. There are no accounts in this build, so the name is typed
 * once and kept in this browser; the api requires it on every write because a
 * correction nobody signed is not an example phase 11 can learn from.
 *
 * It is read as an external store rather than into state in an effect, because
 * that is what it is: the browser owns the value, this subscribes to it, and
 * two panes open at once see the same name the moment either sets it.
 *
 * Storage can throw or come back empty (a private window, blocked site data),
 * so every read is guarded and an absent name simply asks again.
 */

const KEY = "retina.reviewer";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return window.localStorage.getItem(KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** On the server there is no browser to ask, so nobody is named and the first write asks. */
const NOBODY = "";

export interface Reviewer {
  /** Empty until a name has been given. The action bar asks for one before it writes. */
  name: string;
  set(name: string): void;
}

export function useReviewer(): Reviewer {
  const name = useSyncExternalStore(subscribe, read, () => NOBODY);

  const set = useCallback((next: string) => {
    try {
      window.localStorage.setItem(KEY, next.trim());
    } catch {
      // A browser that will not keep it should not stop the work: the name is
      // asked for again next time rather than blocking this write now.
    }
    for (const listener of listeners) listener();
  }, []);

  return { name, set };
}
