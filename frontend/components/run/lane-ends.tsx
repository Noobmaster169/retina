import Link from "next/link";

import type { LaneMap } from "./progress";

/**
 * What a lane ended with, hung under the card that ended it. Two of the six
 * cards carry one: `Sorted` carries what never needed a check, and `Checked`
 * carries where the checked pairs came out.
 *
 * The chips are tinted and the count inside them stays ink, so the hue says
 * which verdict and the number stays as readable as every other number on the
 * page. They are named the way the outcomes panel below names the same
 * things, because a person reading down the page should not meet one
 * vocabulary at the top and another underneath it.
 *
 * Every one of them opens the inbox on exactly the rows it counted. A number
 * on a board that a person cannot get behind is a number they have to take on
 * trust, and the whole point of the page is that they do not have to.
 */

const TINT = {
  match: "bg-match-tint text-match",
  differ: "bg-differ-tint text-differ",
  review: "bg-review-tint text-review",
  fault: "bg-fault-tint text-fault",
  // No verdict was reached, so no verdict hue. The same weight the outcomes
  // panel gives `No check needed`, which is the other end that read nothing.
  muted: "bg-sunken text-ink-secondary",
} as const;

/** The short rule that hangs one of these under its card. */
export function Drop() {
  return <span className="h-[26px] w-px shrink-0 bg-hairline-strong" aria-hidden="true" />;
}

export function NotComparable({ runId, count }: { runId: string; count: number }) {
  return (
    <Link
      href={`/runs/${runId}/inbox?filter=no-check`}
      className="flex h-[34px] w-[286px] max-w-full shrink-0 items-center gap-2.5 rounded-md border border-hairline bg-surface px-3 transition-colors duration-150 hover:bg-sunken"
    >
      <span className="shrink-0 text-small text-ink-secondary">No check needed, finished</span>
      <span className="grow" />
      <span className="shrink-0 text-strong font-semibold tabular-nums">{count}</span>
    </Link>
  );
}

export function Ends({ runId, ends }: { runId: string; ends: LaneMap["ends"] }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {ends.map((end) => (
        <Link
          key={end.filter}
          href={`/runs/${runId}/inbox?filter=${end.filter}`}
          className={`flex h-[34px] shrink-0 items-center gap-2.5 rounded-md px-3 transition-opacity duration-150 hover:opacity-80 ${TINT[end.tone]}`}
        >
          <span className="text-small font-medium">{end.label}</span>
          <span className="text-strong font-semibold tabular-nums text-ink">{end.count}</span>
        </Link>
      ))}
    </div>
  );
}
