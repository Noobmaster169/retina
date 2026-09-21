"use client";

import { AnimatePresence, motion } from "motion/react";

import { Icon } from "@/components/ui/icons";
import type { Answer, EmailVerdict } from "@/lib/api/scoring-schemas";
import { panel } from "@/lib/motion";

import { ClassifyStrip } from "./classify-strip";
import type { CheckName } from "./filters";
import { VerdictDetail } from "./verdict-detail";

/**
 * One email of the run. Only a wrong cell is coloured, and it carries the
 * truth under it rather than in a second table; a right cell is neutral,
 * because a right answer is not a verdict worth spending a hue on.
 *
 * Under the cells sits the chain that produced them, so "which reader got this
 * wrong" is answered without opening anything.
 */

export const COLUMNS: { check: CheckName; label: string; show: (answer: Answer) => string }[] = [
  { check: "category", label: "Category", show: (a) => a.category },
  { check: "status", label: "Status", show: (a) => a.status },
  { check: "reviewReason", label: "Review reason", show: (a) => a.review_reason ?? "none" },
  { check: "defect", label: "Defect", show: (a) => (a.has_defect ? "yes" : "no") },
  { check: "defectFields", label: "Defect fields", show: (a) => (a.defect_fields.length ? a.defect_fields.join(", ") : "none") },
];

interface RowProps {
  runId: string;
  verdict: EmailVerdict;
  open: boolean;
  onToggle: () => void;
}

export function VerdictRow({ runId, verdict, open, onToggle }: RowProps) {
  return (
    <>
      <tr className={`align-top ${open ? "bg-surface" : ""}`}>
        <td className="py-2 pl-4 pr-3">
          <button type="button" onClick={onToggle} aria-expanded={open} className="flex items-start gap-1.5 text-left">
            <Icon
              name="chevron"
              size={11}
              className={`mt-1 shrink-0 text-ink-faint transition-transform ${open ? "rotate-90" : ""}`}
            />
            <span>
              <span className="block font-mono text-mono-sm">{verdict.emailId}</span>
              <span className="block text-caption text-ink-tertiary">
                {verdict.inHoldout ? "holdout" : "train"}
                {verdict.submitted ? "" : ", no answer"}
              </span>
            </span>
          </button>
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

      <tr className={open ? "bg-surface" : ""}>
        <td colSpan={COLUMNS.length + 2} className="border-b border-hairline-faint px-4 pb-2 pl-[2.1rem]">
          {verdict.classify ? (
            <ClassifyStrip classify={verdict.classify} truth={verdict.truth.category} />
          ) : (
            <span className="text-caption text-ink-tertiary">
              Never classified, so the scorer reads it as its own default.
            </span>
          )}
        </td>
      </tr>

      <AnimatePresence initial={false}>
        {open ? (
          <tr>
            <td colSpan={COLUMNS.length + 2} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={panel}
                className="overflow-hidden"
              >
                <VerdictDetail runId={runId} verdict={verdict} />
              </motion.div>
            </td>
          </tr>
        ) : null}
      </AnimatePresence>
    </>
  );
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
