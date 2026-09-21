"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { NavAlerts as Alerts, NavCounts as Counts } from "./nav";

/**
 * What the rail shows against its destinations. A page that has them renders
 * `<NavCounts counts={...} />`; the shell reads them here. Absent means no
 * count, and a page that leaves clears what the last one set.
 *
 * `alerts` rides with the counts rather than in a context of its own, because
 * they are two readings of one thing and a page that knows one knows the
 * other: `Inbox 104` says how much there is, and the tinted `3` beside it says
 * how much of it is waiting on a person.
 */

export interface NavNumbers {
  counts: Counts;
  alerts: Alerts;
}

interface Held extends NavNumbers {
  set(numbers: NavNumbers): void;
}

const EMPTY: NavNumbers = { counts: {}, alerts: {} };

const Context = createContext<Held>({ ...EMPTY, set: () => undefined });

export function NavCountsProvider({ children }: { children: ReactNode }) {
  const [numbers, set] = useState<NavNumbers>(EMPTY);
  const value = useMemo(() => ({ ...numbers, set }), [numbers]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNavCounts(): NavNumbers {
  const { counts, alerts } = useContext(Context);
  return { counts, alerts };
}

export function NavCounts({ counts, alerts = {} }: { counts: Counts; alerts?: Alerts }) {
  const { set } = useContext(Context);
  // Keyed on the serialised numbers, so a page re-rendering with the same ones
  // does not write the same ones again and again.
  const key = JSON.stringify({ counts, alerts });
  useEffect(() => {
    set(JSON.parse(key) as NavNumbers);
    return () => set(EMPTY);
  }, [key, set]);
  return null;
}
