"use client";

import { useEffect } from "react";

import { useDock } from "./dock-state";
import type { OfferedRef } from "./page-context";

/** A page says what it is about. Rendered by the page, read by the dock; cleared when the page leaves. */
export function PageContext({
  refs,
  suggestions = [],
  note = null,
}: {
  refs: OfferedRef[];
  suggestions?: string[];
  note?: string | null;
}) {
  const { announce } = useDock();
  const key = JSON.stringify([refs, suggestions, note]);
  useEffect(() => {
    const [nextRefs, nextSuggestions, nextNote] = JSON.parse(key) as [OfferedRef[], string[], string | null];
    announce(nextRefs, nextSuggestions, nextNote);
    return () => announce([], [], null);
  }, [key, announce]);
  return null;
}
