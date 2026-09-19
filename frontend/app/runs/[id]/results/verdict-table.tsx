"use client";

import { useState } from "react";

import type { Answer, EmailVerdict } from "@/lib/api/scoring-schemas";

type CheckName = keyof EmailVerdict["checks"];

const COLUMNS: { check: CheckName; label: string; show: (a: Answer) => string }[] = [
  { check: "category", label: "Category", show: (a) => a.category },
  { check: "status", label: "Status", show: (a) => a.status },
  { check: "reviewReason", label: "Review reason", show: (a) => a.review_reason ?? "none" },
  { check: "defect", label: "Defect", show: (a) => (a.has_defect ? "yes" : "no") },
  { check: "defectFields", label: "Defect fields", show: (a) => (a.defect_fields.length ? a.defect_fields.join(", ") : "none") },
];

function Cell({ ok, answer, truth }: { ok: boolean | null; answer: string; truth: string }) {
  if (ok === null) return <td className="py-2 pr-3 text-xs text-muted">not scored</td>;
  return (
    <td className={`py-2 pr-3 text-xs ${ok ? "" : "bg-red-50"}`}>
      <div className={ok ? "text-accent-ink" : "font-semibold text-red-700"}>{answer}</div>
      {!ok && <div className="text-muted">truth: {truth}</div>}
    </td>
  );
}

const isWrong = (v: EmailVerdict) => Object.values(v.checks).some((ok) => ok === false);

/** Every email of the run, its answer beside the truth: right checks in plain, wrong ones in red with the truth under them. */
export function VerdictTable({ verdicts }: { verdicts: EmailVerdict[] }) {
  const [onlyWrong, setOnlyWrong] = useState(false);
  const wrong = verdicts.filter(isWrong).length;
  const shown = onlyWrong ? verdicts.filter(isWrong) : verdicts;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span>
          <span className="font-semibold tabular-nums">{verdicts.length - wrong}</span> of {verdicts.length} emails right on
          every scored check, <span className="font-semibold tabular-nums text-red-700">{wrong}</span> with something wrong
        </span>
        <label className="flex items-center gap-2 text-muted">
          <input type="checkbox" checked={onlyWrong} onChange={(e) => setOnlyWrong(e.target.checked)} />
          only the wrong ones
        </label>
      </div>
      <div className="mt-3 overflow-x-auto border-t border-line">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-medium">Email</th>
              {COLUMNS.map((c) => (
                <th key={c.check} className="py-2 pr-3 font-medium">
                  {c.label}
                </th>
              ))}
              <th className="py-2 font-medium">End to end</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.emailId} className="border-b border-line align-top">
                <td className="py-2 pr-3">
                  <div className="font-mono text-xs">{v.emailId}</div>
                  <div className="text-xs text-muted">
                    {v.inHoldout ? "holdout" : "train"}
                    {v.submitted ? "" : ", no answer"}
                  </div>
                </td>
                {COLUMNS.map((c) => (
                  <Cell key={c.check} ok={v.checks[c.check]} answer={c.show(v.answer)} truth={c.show(v.truth)} />
                ))}
                <td className="py-2 text-xs">
                  {v.checks.endToEnd === null ? (
                    <span className="text-muted">not scored</span>
                  ) : (
                    <span className={v.checks.endToEnd ? "text-accent-ink" : "font-semibold text-red-700"}>
                      {v.checks.endToEnd ? "right" : "wrong"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
