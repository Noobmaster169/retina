"use client";

import { useState } from "react";

import { Panel, PanelHead } from "@/components/ui/panel";
import type { Answer, EmailVerdict } from "@/lib/api/scoring-schemas";

/**
 * Every email of the run, its answer beside the truth. The scorer reports
 * totals; this is the one place a person can see which email it was and what
 * it should have said.
 *
 * Only a wrong cell is coloured, and it carries the truth under it rather than
 * in a second table. A right cell is neutral, because a right answer is not a
 * verdict worth spending a hue on.
 */

type CheckName = keyof EmailVerdict["checks"];

const COLUMNS: { check: CheckName; label: string; show: (answer: Answer) => string }[] = [
  { check: "category", label: "Category", show: (a) => a.category },
  { check: "status", label: "Status", show: (a) => a.status },
  { check: "reviewReason", label: "Review reason", show: (a) => a.review_reason ?? "none" },
  { check: "defect", label: "Defect", show: (a) => (a.has_defect ? "yes" : "no") },
  { check: "defectFields", label: "Defect fields", show: (a) => (a.defect_fields.length ? a.defect_fields.join(", ") : "none") },
];

const isWrong = (verdict: EmailVerdict) => Object.values(verdict.checks).some((ok) => ok === false);

export function VerdictTable({ verdicts }: { verdicts: EmailVerdict[] }) {
  const [onlyWrong, setOnlyWrong] = useState(false);
  const wrong = verdicts.filter(isWrong).length;
  const shown = onlyWrong ? verdicts.filter(isWrong) : verdicts;

  return (
    <Panel className="overflow-hidden">
      <PanelHead
        title="Email by email"
        note={`${verdicts.length - wrong} of ${verdicts.length} right on every scored check`}
        aside={
          <label className="flex cursor-pointer items-center gap-2 text-small text-ink-tertiary">
            <input
              type="checkbox"
              checked={onlyWrong}
              onChange={(event) => setOnlyWrong(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--ink)]"
            />
            only the {wrong} with something wrong
          </label>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left">
          <thead>
            <tr className="border-y border-hairline">
              <Th>Email</Th>
              {COLUMNS.map((column) => (
                <Th key={column.check}>{column.label}</Th>
              ))}
              <Th>End to end</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((verdict) => (
              <tr key={verdict.emailId} className="border-b border-hairline-faint align-top">
                <td className="py-2 pl-4 pr-3">
                  <span className="block font-mono text-mono-sm">{verdict.emailId}</span>
                  <span className="block text-caption text-ink-tertiary">
                    {verdict.inHoldout ? "holdout" : "train"}
                    {verdict.submitted ? "" : ", no answer"}
                  </span>
                </td>
                {COLUMNS.map((column) => (
                  <Cell
                    key={column.check}
                    ok={verdict.checks[column.check]}
                    answer={column.show(verdict.answer)}
                    truth={column.show(verdict.truth)}
                  />
                ))}
                <td className="py-2 pr-4 text-small">
                  {verdict.checks.endToEnd === null ? (
                    <span className="text-ink-tertiary">not scored</span>
                  ) : (
                    <span className={verdict.checks.endToEnd ? "text-ink" : "font-medium text-fault"}>
                      {verdict.checks.endToEnd ? "right" : "wrong"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-8 text-center text-small text-ink-tertiary">
          Nothing wrong on any scored check. Untick the box to see them all.
        </p>
      ) : null}
    </Panel>
  );
}

/** Sentence case at the caption size. Section 5.1 retired the uppercase label. */
function Th({ children }: { children: string }) {
  return <th className="h-8 pl-4 pr-3 align-middle text-caption font-normal text-ink-tertiary">{children}</th>;
}

function Cell({ ok, answer, truth }: { ok: boolean | null; answer: string; truth: string }) {
  if (ok === null) return <td className="py-2 pl-4 pr-3 text-small text-ink-tertiary">not scored</td>;
  return (
    <td className={`py-2 pl-4 pr-3 text-small ${ok ? "" : "bg-fault-tint"}`}>
      <span className={`block font-mono text-mono-sm ${ok ? "text-ink" : "text-fault"}`}>{answer}</span>
      {ok ? null : <span className="mt-0.5 block text-caption text-ink-tertiary">truth: {truth}</span>}
    </td>
  );
}
