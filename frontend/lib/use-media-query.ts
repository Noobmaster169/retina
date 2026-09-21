"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query holds right now.
 *
 * Almost everything responsive here is a Tailwind variant and needs none of
 * this. It exists for the one thing a class cannot express: a decision about
 * what to render rather than how to draw it.
 *
 * The server has no viewport, so it answers false and the browser corrects it
 * during hydration. Nothing may depend on that first answer being right.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
