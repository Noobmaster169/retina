"use client";

import { useMemo, useState } from "react";

import { Panel, PanelHead } from "@/components/ui/panel";
import type { EmailVerdict } from "@/lib/api/scoring-schemas";

import { type Filters, isWrong, matches, NO_FILTERS } from "./filters";
import { VerdictFilters } from "./verdict-filters";
import { wrongSentence } from "./verdict-reading";
import { COLUMNS, VerdictRow } from "./verdict-row";

/**
 * Every email of the run, its answer beside the truth and the chain that
 * produced it. The scorer reports totals; this is the one place a person can
 * see which email it was, what it should have said, and what each reader wrote
 * on the way to getting it wrong.
 */

export function VerdictTable({ runId, verdicts }: { runId: string; verdicts: EmailVerdict[] }) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [open, setOpen] = useState<string | null>(null);

  const wrong = useMemo(() => verdicts.filter(isWrong).length, [verdicts]);
  const shown = useMemo(() => verdicts.filter((verdict) => matches(verdict, filters)), [verdicts, filters]);
  const narrowed = shown.length !== verdicts.length;

  return (
    <Panel className="overflow-hidden">
      <PanelHead
        title="Email by email"
        note={wrongSentence(wrong, verdicts.length)}
        aside={
          <span className="flex items-center gap-2 text-small text-ink-tertiary">
            <span className="tabular-nums">{shown.length} shown</span>
            {narrowed ? (
              <button
                type="button"
                onClick={() => setFilters(NO_FILTERS)}
                className="underline underline-offset-2 hover:text-ink"
              >
                clear
              </button>
            ) : null}
          </span>
        }
      />

      <VerdictFilters verdicts={verdicts} filters={filters} onChange={setFilters} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left">
          <thead>
            <tr className="border-b border-hairline">
              <Th>Email</Th>
              {COLUMNS.map((column) => (
                <Th key={column.check}>{column.label}</Th>
              ))}
              <Th>End to end</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((verdict) => (
              <VerdictRow
                key={verdict.emailId}
                runId={runId}
                verdict={verdict}
                open={open === verdict.emailId}
                onToggle={() => setOpen(open === verdict.emailId ? null : verdict.emailId)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-8 text-center text-small text-ink-tertiary">
          No email matches. Clear the filters to see the other {verdicts.length}.
        </p>
      ) : null}
    </Panel>
  );
}

/** Sentence case at the caption size. Section 5.1 retired the uppercase label. */
function Th({ children }: { children: string }) {
  return <th className="h-8 pl-4 pr-3 align-middle text-caption font-normal text-ink-tertiary">{children}</th>;
}
