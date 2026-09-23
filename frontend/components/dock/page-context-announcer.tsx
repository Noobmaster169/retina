"use client";

import { useEffect } from "react";

import { useDock } from "./dock-state";
import type { OfferedRef } from "./page-context";

/** A page says what it is about. Rendered by the page, read by the dock; cleared when the page leaves. */
export function PageContext({
  refs,
  suggestions = [],
  note = null,
  loading = false,
}: {
  refs: OfferedRef[];
  suggestions?: string[];
  note?: string | null;
  loading?: boolean;
}) {
  const { announce } = useDock();
  const key = JSON.stringify([refs, suggestions, note, loading]);
  useEffect(() => {
    const [nextRefs, nextSuggestions, nextNote, nextLoading] = JSON.parse(key) as [
      OfferedRef[],
      string[],
      string | null,
      boolean,
    ];
    announce(nextRefs, nextSuggestions, nextNote, nextLoading);
    return () => announce([], [], null, false);
  }, [key, announce]);
  return null;
}
