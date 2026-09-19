"use client";

import { useEffect, useRef } from "react";

import type { LiveCallView } from "@/lib/api/trace-schemas";

import { stepLabel } from "./step-label";

function seconds(since: string): string {
  return `${Math.max(0, (Date.now() - new Date(since).getTime()) / 1000).toFixed(0)} s`;
}

/** One call as the model writes it: the answer so far, kept scrolled to the newest text. */
export function StreamingText({ call }: { call: LiveCallView }) {
  const box = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [call.text]);

  return (
    <div className="rounded-lg border border-accent/40 bg-surface">
      <div className="flex flex-wrap items-baseline gap-x-3 border-b border-line px-3 py-1.5 text-xs">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
        <span className="font-semibold">{stepLabel(call.step)} writing</span>
        <span className="text-muted">
          {call.step} {call.promptVersion} on {call.model}
          {call.attempt > 1 ? `, attempt ${call.attempt}` : ""}
        </span>
        <span className="ml-auto tabular-nums text-muted">running {seconds(call.startedAt)}</span>
      </div>
      <pre ref={box} className="max-h-56 overflow-auto whitespace-pre-wrap wrap-break-word px-3 py-2 font-mono text-xs leading-relaxed">
        {call.text || "waiting for the first words…"}
      </pre>
    </div>
  );
}
