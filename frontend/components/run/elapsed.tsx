"use client";

import { useEffect, useState } from "react";

/**
 * How long an email has held its slot, ticking on its own clock rather than
 * on the poll. The queues are read every two seconds, and a time that jumped
 * 2.0s at a time read as a page that had stopped rather than one that was
 * working.
 *
 * It is not optimism and it is not a guess: `startedAt` is an instant the
 * worker recorded, so this is the real elapsed time, measured continuously
 * against a clock instead of sampled. The poll only ever moves `startedAt`,
 * which does not change while a job holds its slot.
 *
 * The component owns the interval so the panel around it does not re-render
 * ten times a second and re-run every row's layout animation.
 */

const TICK_MS = 100;

interface ElapsedProps {
  /** When the worker took the job, as an instant. Null when BullMQ recorded none. */
  since: string | null;
  /** How long a call of this kind usually takes, so the rule along the row has a scale. */
  typicalMs: number;
}

export function Elapsed({ since, typicalMs }: ElapsedProps) {
  const at = since === null ? null : Date.parse(since);
  const ms = useElapsed(at);
  if (ms === null) return null;
  return (
    <>
      <span className="font-mono text-micro tabular-nums text-ink-tertiary">{words(ms)}</span>
      {/*
        The rule grows with the clock rather than in steps, which is the whole
        "this is live" signal on a row. Section 9 bans a loop, and this is not
        one: it is a measurement, and it stops when the job does.
      */}
      <span
        className="absolute bottom-0 left-0 h-0.5 bg-signal-line transition-none"
        style={{ width: `${Math.min(100, (ms / typicalMs) * 100)}%` }}
        aria-hidden="true"
      />
    </>
  );
}

/** The same clock for a row that only shows the number, with no rule under it. */
export function ElapsedText({ since, prefix = "" }: { since: string | null; prefix?: string }) {
  const ms = useElapsed(since === null ? null : Date.parse(since));
  if (ms === null) return null;
  return <span className="font-mono text-micro tabular-nums text-ink-faint">{`${prefix}${words(ms)}`}</span>;
}

function useElapsed(at: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null) return;
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(tick);
  }, [at]);
  if (at === null || Number.isNaN(at)) return null;
  return Math.max(0, now - at);
}

/** Tenths under a minute, because that is the scale a model call runs on. */
function words(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}s`;
}
