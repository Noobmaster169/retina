"use client";

import Link from "next/link";
import { motion } from "motion/react";

import { statusWord } from "@/components/run/run-header";
import { Bar } from "@/components/ui/panel";
import type { RunSummary } from "@/lib/api/runs-schemas";
import { formatDuration } from "@/lib/duration";

/**
 * One run, on two lines. The whole row is the link, because section 10 asks
 * every table row to be one; nothing else on it is clickable, so there is
 * nothing to miss and nothing to hit by accident.
 *
 * What ended up where is the organisers' enums, quiet and in their own order.
 * A run with no verdicts yet shows its stages instead, which is the only thing
 * it knows.
 */

export function RunRow({ run }: { run: RunSummary }) {
  const status = statusWord(run, false);
  const finished = run.totalEmails ? (run.finishedEmails / run.totalEmails) * 100 : 0;

  return (
    <tr className="group relative border-b border-hairline-faint transition-colors duration-150 hover:bg-sunken">
      <Cell>
        {/* One link, stretched over the row: section 10 asks every table row to
            be a link, and a link per cell would make the row six tab stops. */}
        <Link href={`/runs/${run.id}`} className="block after:absolute after:inset-0 after:content-['']">
          <span className="block text-strong group-hover:underline">{started(run)}</span>
          <span className="mt-0.5 block font-mono text-mono-sm text-ink-tertiary">{run.id.slice(0, 8)}</span>
        </Link>
      </Cell>

      <Cell>
        <span className={`inline-flex h-[22px] items-center rounded-sm px-2 text-caption font-medium ${status.tint}`}>
          {status.word}
        </span>
      </Cell>

      <Cell>
        <span className="font-mono text-mono-sm tabular-nums text-ink-tertiary">
          {run.ratePerSecond === 0 ? "burst" : `${run.ratePerSecond}/s`}
        </span>
      </Cell>

      <Cell>
        <div className="flex items-center gap-2.5">
          <Bar pct={finished} tone={run.processingDone ? "var(--ink-faint)" : "var(--signal)"} height={4} />
          <span className="shrink-0 font-mono text-mono-sm tabular-nums">
            {run.finishedEmails} / {run.totalEmails ?? "?"}
          </span>
        </div>
        <span className="mt-1 block text-caption tabular-nums text-ink-tertiary">
          {run.elapsedMs === null ? "not started" : `${run.processingDone ? "took" : "running for"} ${formatDuration(run.elapsedMs)}`}
        </span>
      </Cell>

      <Cell>
        <Outcomes run={run} />
      </Cell>

      <Cell className="text-right">
        <Score run={run} />
      </Cell>
    </tr>
  );
}

function Cell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-3 pr-4 align-top ${className}`}>{children}</td>;
}

/** The enums verbatim, and nothing coloured that has no verdict. */
function Outcomes({ run }: { run: RunSummary }) {
  const ends = [
    { key: "OK", count: run.outcomes.ok, ink: "text-match" },
    { key: "MISMATCH", count: run.outcomes.mismatch, ink: "text-differ" },
    { key: "needs a person", count: run.review.open, ink: "text-review" },
    { key: "failed", count: run.stageCounts.failed, ink: "text-fault" },
  ].filter((end) => end.count > 0);

  if (ends.length === 0) {
    const moving = run.finishedEmails === 0 && !run.processingDone;
    return <span className="text-small text-ink-tertiary">{moving ? "still sorting" : "nothing to check"}</span>;
  }

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {ends.map((end) => (
        <motion.span
          key={end.key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.14 }}
          className="flex items-baseline gap-1.5"
        >
          <span className={`font-mono text-mono-xs ${end.ink}`}>{end.key}</span>
          <span className="text-small font-medium tabular-nums">{end.count}</span>
        </motion.span>
      ))}
    </span>
  );
}

function Score({ run }: { run: RunSummary }) {
  const last = run.lastSubmission;
  if (!last || last.finalScore === null) {
    return <span className="text-small text-ink-tertiary">not submitted</span>;
  }
  return (
    <>
      <span className="font-mono text-mono tabular-nums">{last.finalScore.toFixed(4)}</span>
      <span className="mt-0.5 block text-caption text-ink-tertiary">
        over {last.nEmails}
        {last.forced ? ", forced" : ""}
      </span>
    </>
  );
}

function started(run: RunSummary): string {
  return new Date(run.startedAt ?? run.createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
