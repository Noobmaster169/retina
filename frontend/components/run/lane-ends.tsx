import type { LaneMap } from "./progress";

/**
 * What a lane ended with, hung under the card that ended it. Two of the six
 * cards carry one: `Sorted` carries what never needed a check, and `Checked`
 * carries where the checked pairs came out.
 *
 * The chips are tinted and the count inside them stays ink, so the hue says
 * which verdict and the number stays as readable as every other number on the
 * page.
 */

const TINT = {
  match: "bg-match-tint text-match",
  differ: "bg-differ-tint text-differ",
  review: "bg-review-tint text-review",
  fault: "bg-fault-tint text-fault",
} as const;

/** The short rule that hangs one of these under its card. */
export function Drop() {
  return <span className="h-[26px] w-px shrink-0 bg-hairline-strong" aria-hidden="true" />;
}

export function NotComparable({ count }: { count: number }) {
  return (
    <div className="flex h-[34px] w-[286px] max-w-full shrink-0 items-center gap-2.5 rounded-md border border-hairline bg-surface px-3">
      <span className="shrink-0 text-small text-ink-secondary">Nothing to check, finished</span>
      <span className="grow" />
      <span className="shrink-0 font-mono text-mono-xs text-ink-tertiary">not_comparable</span>
      <span className="shrink-0 text-strong font-semibold tabular-nums">{count}</span>
    </div>
  );
}

export function Ends({ ends }: { ends: LaneMap["ends"] }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {ends.map((end) => (
        <span key={end.key} className={`flex h-[34px] shrink-0 items-center gap-2.5 rounded-md px-3 ${TINT[end.tone]}`}>
          <span className="font-mono text-mono-xs">{end.key}</span>
          <span className="text-strong font-semibold tabular-nums text-ink">{end.count}</span>
        </span>
      ))}
    </div>
  );
}
