"use client";

import Link from "next/link";
import { motion } from "motion/react";

import { Icon } from "@/components/ui/icons";
import { Bar, Panel, PanelFoot, PanelHead } from "@/components/ui/panel";
import { RunSummary } from "@/lib/api/runs-schemas";
import { stagger } from "@/lib/motion";

import { outcomeRows, type OutcomeRow } from "./progress";

/**
 * Where the run's emails end up, in the organisers' own words. The keys are
 * their enums verbatim and nothing here prettifies one into sentence case: the
 * values are fixed by the scorer and the product speaks the domain's language.
 *
 * A count is a number and a share is a bar. Section 4.8 retired every chart.
 */

const TONES: Record<OutcomeRow["tone"], { key: string; bar: string; count: string }> = {
  match: { key: "text-match", bar: "var(--verdict-match)", count: "text-ink" },
  differ: { key: "text-differ", bar: "var(--verdict-differ)", count: "text-ink" },
  review: { key: "text-review", bar: "var(--verdict-review)", count: "text-ink" },
  fault: { key: "text-fault", bar: "var(--verdict-fault)", count: "text-ink" },
  muted: { key: "text-ink-tertiary", bar: "var(--ink-faint)", count: "text-ink-tertiary" },
};

interface OutcomesPanelProps {
  run: RunSummary;
  notComparable: number;
  className?: string;
}

export function OutcomesPanel({ run, notComparable, className = "" }: OutcomesPanelProps) {
  const { finished, parked } = outcomeRows(run, notComparable);
  const total = run.totalEmails ?? run.finishedEmails;
  const open = run.review.open;

  return (
    <Panel className={`overflow-hidden ${className}`}>
      <PanelHead
        title="Where they end up"
        aside={
          <span className="text-small text-ink-tertiary">
            {run.processingDone ? `all ${total} finished` : `${run.finishedEmails} of ${total} finished`}
          </span>
        }
      />
      <div className="px-4">
        <Group label="Finished with no person" />
        {finished.map((row, index) => (
          <Row key={row.key} row={row} index={index} />
        ))}
        {parked.length > 0 ? <Group label="Parked for a person" /> : null}
        {parked.map((row, index) => (
          <Row key={row.key} row={row} index={finished.length + index} />
        ))}
      </div>
      <span className="grow" />
      <PanelFoot className="py-3">
        <Link
          href={`/runs/${run.id}/emails?filter=review`}
          className={`flex h-[34px] items-center gap-2 rounded-md px-3 transition-opacity duration-150 hover:opacity-80 ${
            open > 0 ? "bg-review-tint" : "bg-sunken"
          }`}
        >
          <span className={`text-strong font-medium ${open > 0 ? "text-review" : "text-ink-tertiary"}`}>
            {open === 0 ? "Nobody is needed" : `${open} ${open === 1 ? "needs" : "need"} a person`}
          </span>
          <span className="grow" />
          <Icon name="chevron" size={12} className={open > 0 ? "text-review" : "text-ink-faint"} />
        </Link>
      </PanelFoot>
    </Panel>
  );
}

function Group({ label }: { label: string }) {
  return <div className="flex h-[26px] items-center text-caption font-medium text-ink-tertiary">{label}</div>;
}

function Row({ row, index }: { row: OutcomeRow; index: number }) {
  const tone = TONES[row.tone];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={stagger(index)}
      className={`flex h-[31px] items-center gap-2.5 ${row.indent ? "pl-3" : ""}`}
    >
      <span className={`w-[118px] shrink-0 font-mono text-micro ${tone.key}`}>{row.key}</span>
      <Bar pct={row.pct} tone={tone.bar} />
      <span className={`w-[30px] shrink-0 text-right text-small font-medium tabular-nums ${tone.count}`}>
        {row.count}
      </span>
    </motion.div>
  );
}
