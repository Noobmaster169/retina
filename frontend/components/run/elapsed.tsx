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
 *
 * `ticking` is how a pause reaches it. A paused run's emails are not getting
 * older in any sense a person cares about: nothing is working on them and
 * nothing is waiting for a slot, so a clock that kept climbing was measuring
 * how long the person had left the run paused for and labelling it as how
 * long the email had been held. It stops where the pause found it.
 */

const TICK_MS = 100;

interface ElapsedProps {
  /** When the worker took the job, as an instant. Null when BullMQ recorded none. */
  since: string | null;
  /** False while the run is paused: the reading freezes rather than counting the pause. */
  ticking?: boolean;
}

export function Elapsed({ since, ticking = true }: ElapsedProps) {
  const ms = useElapsed(since === null ? null : Date.parse(since), ticking);
  if (ms === null) return null;
  return (
    <>
      <span className="font-mono text-micro tabular-nums text-ink-tertiary">{words(ms)}</span>
      {/*
        The row sweeps for the same reason a card does: a model call has no
        denominator, and the rule used to grow against a "typical" duration,
        which was a denominator invented for the drawing. The time beside it is
        the real measurement; this only says the row is working.
      */}
      <span className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden" aria-hidden="true">
        <span className="sweep block h-0.5 rounded-full bg-signal-line" />
      </span>
    </>
  );
}

/** The same clock for a row that only shows the number, with no rule under it. */
export function ElapsedText({ since, prefix = "", ticking = true }: { since: string | null; prefix?: string; ticking?: boolean }) {
  const ms = useElapsed(since === null ? null : Date.parse(since), ticking);
  if (ms === null) return null;
  return <span className="font-mono text-micro tabular-nums text-ink-faint">{`${prefix}${words(ms)}`}</span>;
}

function useElapsed(at: number | null, ticking: boolean): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null || !ticking) return;
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(tick);
  }, [at, ticking]);
  if (at === null || Number.isNaN(at)) return null;
  return Math.max(0, now - at);
}

/** Tenths under a minute, because that is the scale a model call runs on. */
function words(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}s`;
}
