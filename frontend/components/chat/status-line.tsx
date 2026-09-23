"use client";

import { useEffect, useState } from "react";

import type { ChatProgress } from "@/lib/api/chat-thread-schemas";

/**
 * What the agent is doing, while it is doing it.
 *
 * One line, not a list. The working a turn does is worth keeping and is kept,
 * under the answer and folded away; what belongs here is only enough to say
 * that something is happening and roughly what, because that is the whole of
 * what a person waiting actually wants to know.
 *
 * The clock stays. A wait a person can watch is a different wait from one they
 * cannot, and a turn through a proxy that starts an agent session per call is a
 * genuinely long one.
 */

/** One second. Anything finer reads as jitter, and the steps take seconds. */
const TICK_MS = 1000;

function Elapsed({ from }: { from: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const every = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(every);
  }, []);
  return (
    <span className="shrink-0 font-mono text-mono-xs text-ink-faint" aria-hidden>
      {Math.max(0, Math.round((now - from) / 1000))} s
    </span>
  );
}

/**
 * Three dots, out of phase with each other.
 *
 * A single spinner says only that something is running. These carry the same
 * information and read as a thing thinking rather than a thing waiting, which
 * is what the wait actually is.
 */
export function ThinkingMark() {
  return (
    <span className="flex shrink-0 items-center gap-[3px]" aria-hidden>
      <span className="size-[5px] animate-pulse rounded-full bg-ink-tertiary [animation-duration:1100ms]" />
      <span className="size-[5px] animate-pulse rounded-full bg-ink-tertiary [animation-delay:170ms] [animation-duration:1100ms]" />
      <span className="size-[5px] animate-pulse rounded-full bg-ink-tertiary [animation-delay:340ms] [animation-duration:1100ms]" />
    </span>
  );
}

/** The phase in the reader's words. A tool's name is shown as the tool spells it, because that is what the working will call it too. */
export function phaseWords(progress: ChatProgress | null): string {
  if (!progress) return "Reading the question";
  if (progress.phase === "looking") {
    return progress.tools.length > 0 ? `Looking with ${progress.tools.join(", ")}` : "Looking";
  }
  if (progress.phase === "writing") return "Writing the answer";
  return progress.step === 1 ? "Reading the question" : "Working out what is next";
}

export function StatusLine({ progress, since }: { progress: ChatProgress | null; since: number }) {
  return (
    <div className="flex max-w-[72ch] items-center gap-2">
      <ThinkingMark />
      <span className="min-w-0 truncate text-caption text-ink-tertiary" aria-live="polite">
        {phaseWords(progress)}
      </span>
      <span className="grow" />
      <Elapsed from={since} />
    </div>
  );
}
