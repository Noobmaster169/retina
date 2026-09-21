"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { NavCounts as Counts } from "./nav";

/**
 * The counts the rail shows against its destinations. A page that has them
 * renders `<NavCounts counts={...} />`; the shell reads them here. Absent means
 * no count, and a page that leaves clears what the last one set.
 */

interface Held {
  counts: Counts;
  set(counts: Counts): void;
}

const Context = createContext<Held>({ counts: {}, set: () => undefined });

export function NavCountsProvider({ children }: { children: ReactNode }) {
  const [counts, set] = useState<Counts>({});
  const value = useMemo(() => ({ counts, set }), [counts]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNavCounts(): Counts {
  return useContext(Context).counts;
}

export function NavCounts({ counts }: { counts: Counts }) {
  const { set } = useContext(Context);
  // Keyed on the serialised counts, so a page re-rendering with the same
  // numbers does not write the same numbers again and again.
  const key = JSON.stringify(counts);
  useEffect(() => {
    set(JSON.parse(key) as Counts);
    return () => set({});
  }, [key, set]);
  return null;
}
