"use client";

import { useEffect, useState } from "react";

import type { ChatTurn } from "@/lib/api/chat-agent-schemas";

/**
 * What the agent is doing, while it is doing it.
 *
 * Each line is one finished call, written to the database the moment it
 * finished and polled back by the page. The last line is the one still running,
 * and it carries the clock: a wait a person can watch is a different wait from
 * a spinner, and eight model calls through a proxy that serves about half a
 * request a second is a genuinely long one.
 *
 * This is replaced by `tools-used.tsx` when the answer lands, which carries the
 * same calls with their results. Nothing here is the answer.
 */

/** One second. Anything finer reads as jitter, and the calls take seconds. */
const TICK_MS = 1000;

function Elapsed({ from }: { from: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const every = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(every);
  }, []);
  return <span className="font-mono text-mono-xs text-ink-faint">{Math.max(0, Math.round((now - from) / 1000))} s</span>;
}

export function LiveSteps({ steps, since }: { steps: ChatTurn[]; since: number }) {
  return (
    <ul className="max-w-[72ch] space-y-1.5 border-l-2 border-hairline-strong pl-3">
      {steps.map((step) => {
        const call = step.toolCalls[0];
        return (
          <li key={step.id} className="flex items-baseline gap-2">
            <span className="shrink-0 font-mono text-mono-xs text-ink-secondary">{call?.tool ?? "thinking"}</span>
            <span className="min-w-0 grow truncate text-caption text-ink-faint">{step.content}</span>
            <span className="shrink-0 font-mono text-mono-xs text-ink-faint">{call ? `${call.durationMs} ms` : ""}</span>
          </li>
        );
      })}

      {/*
        The step in flight. It has no row yet, because a call is written when it
        finishes, so this line is the only thing standing for the model call
        currently running and the clock is what says it is still running.
      */}
      <li className="flex items-baseline gap-2">
        <span className="shrink-0 font-mono text-mono-xs text-ink">
          {steps.length === 0 ? "reading the question" : "deciding what is next"}
        </span>
        <span className="grow" />
        <Elapsed from={since} />
      </li>
    </ul>
  );
}
