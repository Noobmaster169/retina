"use client";

import type { RefObject } from "react";

/**
 * The end of what is drawn, and how many are still under it.
 *
 * It says the number rather than saying nothing, because a list that is not
 * all there should admit it: a person who has filtered to forty and sees
 * twenty-four needs to know the other sixteen exist and are coming, not
 * wonder whether the filter ate them.
 */
export function MoreBelow({ rest, sentinel }: { rest: number; sentinel: RefObject<HTMLDivElement | null> }) {
  if (rest === 0) return null;
  return (
    <div ref={sentinel} className="py-6 text-center text-small text-ink-tertiary">
      {rest} more
    </div>
  );
}
