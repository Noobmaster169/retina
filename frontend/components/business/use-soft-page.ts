"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { coveringCount, nextCount, openingCount } from "./soft-page";

/**
 * A list that grows as it is scrolled, without ever showing a page control.
 *
 * The rows are all here already, so this hides nothing a person could not
 * reach; it only declines to lay out and paint several hundred of them before
 * anyone has looked. What the browser saves is the first paint, and what the
 * router saves is a prefetch queue with three hundred links in it when the one
 * that matters is the first.
 *
 * `resets` is whatever changing it should send the list back to the top: the
 * filter, the sort, the view. Without it, narrowing a list of three hundred to
 * four would leave the count where the scroll had pushed it.
 *
 * `ensure` is the index of a row that must be drawn whatever the scroll says,
 * for a list where something other than scrolling can point at a row.
 */
export function useSoftPage<T>(rows: T[], step: number, resets: string, ensure = -1) {
  const [state, setState] = useState(() => ({ resets, count: openingCount(step, rows.length) }));
  const sentinel = useRef<HTMLDivElement | null>(null);

  // Reset while rendering rather than in an effect. React's own answer for
  // state that follows a prop: an effect would paint the old count first, so
  // narrowing a list to four would flash the previous twenty-four.
  if (state.resets !== resets) setState({ resets, count: openingCount(step, rows.length) });
  const count = state.resets === resets ? state.count : openingCount(step, rows.length);

  const more = useCallback(
    () => setState((was) => ({ ...was, count: nextCount(was.count, step, rows.length) })),
    [step, rows.length],
  );

  useEffect(() => {
    const end = sentinel.current;
    if (!end) return;
    // Ahead of the fold, so the next rows are laid out before the scroll
    // reaches where they go and the list never visibly stops.
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) more();
      },
      { rootMargin: "600px" },
    );
    watcher.observe(end);
    return () => watcher.disconnect();
  }, [more, count]);

  const drawn = coveringCount(count, ensure, step, rows.length);
  return {
    /** The rows to draw. */
    shown: rows.slice(0, drawn),
    /** How many are still below. Zero means the sentinel is not drawn. */
    rest: Math.max(0, rows.length - drawn),
    /** Put on an element after the rows; seeing it near the fold adds a step. */
    sentinel,
    /** For the browser that never fires the observer. */
    more,
  };
}
