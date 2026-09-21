"use client";

import type { GateOverview } from "@/lib/api/gate-schemas";

import { globalLine, MODE_LINE, pressure } from "./wording";

/**
 * What the gate is doing right now: which mode, what the day has cost, and how
 * much of everyone's shared allowance is gone.
 *
 * The budget bar carries its two thresholds as marks rather than as numbers in
 * a legend, because the question a person has is "how close are we" and a mark
 * answers it without arithmetic.
 */

export function GateHeader({ overview }: { overview: GateOverview }) {
  const { budget, mode } = overview;
  const spent = pressure(budget.spentUsd, budget.budgetUsd);

  return (
    <section className="mt-1 border-b border-hairline pb-5">
      <p className="max-w-[72ch] text-body text-ink-secondary">{MODE_LINE[mode]}</p>

      <div className="mt-4 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-caption text-ink-tertiary">Today&rsquo;s model spend</span>
            <span className="font-mono text-mono-sm text-ink-secondary">
              ${budget.spentUsd.toFixed(2)} of ${budget.budgetUsd.toFixed(2)}
            </span>
          </div>

          <div className="relative mt-1.5 h-1.5 w-full rounded-full bg-hairline">
            <div
              className={`h-full rounded-full ${spent >= budget.haltAt ? "bg-fault" : spent >= budget.squeezeAt ? "bg-differ" : "bg-ink"}`}
              style={{ width: `${spent * 100}%` }}
            />
            <Mark at={budget.squeezeAt} label="strangers start waiting here" />
            <Mark at={budget.haltAt} label="only established senders past here" />
          </div>

          <p className="mt-1.5 text-caption text-ink-tertiary">{globalLine(overview.global)}</p>
        </div>

        <dl className="flex gap-7 sm:justify-end">
          <Stat label="Decisions today" value={overview.decisionsToday} />
          <Stat label="Held today" value={overview.heldToday} />
          <Stat label="Waiting" value={overview.waiting} />
        </dl>
      </div>
    </section>
  );
}

/** A threshold on the bar. Title rather than a visible caption: two labels under a 6px bar is noise. */
function Mark({ at, label }: { at: number; label: string }) {
  return (
    <span
      title={label}
      aria-hidden
      className="absolute top-[-3px] h-[12px] w-px bg-ink-tertiary"
      style={{ left: `${Math.min(100, at * 100)}%` }}
    />
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-caption text-ink-tertiary">{label}</dt>
      <dd className="mt-0.5 font-mono text-mono text-ink">{value}</dd>
    </div>
  );
}
