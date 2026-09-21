"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";

import { statusWord } from "@/components/run/run-header";
import { runName } from "@/components/shell/run-name";
import { Icon } from "@/components/ui/icons";
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

export function RunRow({ run, onDeleted }: { run: RunSummary; onDeleted: () => void }) {
  const status = statusWord(run, false);
  const finished = run.totalEmails ? (run.finishedEmails / run.totalEmails) * 100 : 0;

  return (
    <tr className="group relative border-b border-hairline-faint transition-colors duration-150 hover:bg-sunken">
      <Cell>
        {/* One link, stretched over the row: section 10 asks every table row to
            be a link, and a link per cell would make the row six tab stops. */}
        <Link href={`/runs/${run.id}`} className="block after:absolute after:inset-0 after:content-['']">
          <span className="block text-strong group-hover:underline">{runName(run)}</span>
          <span className="mt-0.5 block font-mono text-mono-sm text-ink-tertiary">
            {run.id.slice(0, 8)} · {started(run)}
          </span>
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

      <Cell className="text-right">
        <Delete run={run} onDeleted={onDeleted} />
      </Cell>
    </tr>
  );
}

/**
 * Dropping a run takes everything it produced with it, so it asks first and
 * names what goes. A running run is refused by the API rather than stopped
 * from under its workers, and the refusal says to cancel it first.
 */
function Delete({ run, onDeleted }: { run: RunSummary; onDeleted: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const emails = run.totalEmails ?? run.finishedEmails;
    if (!window.confirm(`Delete ${runName(run).toLowerCase()}? Its ${emails} emails, every model call it made and its score go with it.`)) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/runs/${run.id}`, { method: "DELETE" });
      if (response.status === 204) {
        onDeleted();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? `Request failed with ${response.status}`);
    } catch (cause) {
      console.error("[runs] delete failed:", cause);
      setError("Could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="relative z-10 inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label={`Delete ${runName(run)}`}
        title={run.status === "running" ? "Cancel it first" : "Delete this run"}
        className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint opacity-0 transition-all duration-150 hover:bg-fault-tint hover:text-fault focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
      >
        <Icon name="trash" size={14} />
      </button>
      {error ? <span className="max-w-[220px] text-right text-caption text-fault">{error}</span> : null}
    </span>
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
