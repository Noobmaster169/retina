"use client";

import { AnimatePresence, motion } from "motion/react";

import { Hatch, MarkedSpan, type MarkState } from "@/components/ui/marked-span";
import type { ExtractedFieldView, FieldJudgementView } from "@/lib/api/comparison-schemas";
import { panel } from "@/lib/motion";

import { collapsedLine, markOf, splitQuote } from "./field-reading";

/**
 * The component this whole product exists to render. Collapsed it is one line:
 * the field's name and what the judge made of it, in words. Expanded it shows
 * both documents' lines with the difference marked at the word, on both sides.
 *
 * Nothing on the row is coloured except the marked span itself. A row that
 * shaded its whole background would say the row is wrong; only two words are.
 */

export interface FieldRowData {
  judgement: FieldJudgementView;
  si: ExtractedFieldView | undefined;
  bl: ExtractedFieldView | undefined;
}

interface FieldRowProps {
  row: FieldRowData;
  open: boolean;
  onToggle: () => void;
}

export function FieldRow({ row, open, onToggle }: FieldRowProps) {
  const { judgement } = row;
  const mark = markOf(judgement, open);
  const rail = judgement.missing
    ? "shadow-[inset_2px_0_0_0_var(--verdict-review)]"
    : judgement.same
      ? ""
      : "shadow-[inset_2px_0_0_0_var(--verdict-differ)]";

  return (
    <div className={`border-t border-hairline-faint ${open ? `pl-3 ${rail}` : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 text-left ${open ? "h-7" : "h-8"}`}
      >
        <span className={`font-mono text-[12px] ${open ? "font-medium text-ink" : "text-ink-secondary"}`}>
          {judgement.field}
        </span>
        <span className={`min-w-0 grow truncate text-small ${judgement.same ? "font-mono text-mono-sm text-ink-tertiary" : "text-ink-tertiary"}`}>
          {open ? "" : collapsedLine(judgement)}
        </span>
        <span className={`shrink-0 text-small ${judgement.same ? "text-ink-tertiary" : "text-differ"}`}>
          {judgement.missing ? "nothing to compare" : judgement.same ? "agree" : "differ"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={panel}
            className="overflow-hidden"
          >
            <div className="pb-2.5">
              <Side label="SI" value={judgement.siValue} field={row.si} mark={mark} />
              <Side label="BL" value={judgement.blValue} field={row.bl} mark={mark} />
              {judgement.rationale ? (
                <p className="ml-[27px] mt-1.5 max-w-[68ch] text-small leading-[17px] text-ink-secondary">
                  {judgement.rationale}
                  {judgement.confidence === null ? null : (
                    <span className="ml-1.5 text-ink-tertiary">{judgement.confidence.toFixed(2)} sure</span>
                  )}
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * One document's line, with the value marked inside it. The surrounding line
 * stays readable as the document it came from: only the value takes the mark,
 * never the row.
 */
function Side({
  label,
  value,
  field,
  mark,
}: {
  label: string;
  value: string | null;
  field: ExtractedFieldView | undefined;
  mark: MarkState;
}) {
  const quote = field?.sourceQuote ?? null;
  return (
    <div className="mt-0.5 flex items-start gap-2.5">
      <span className="w-[18px] shrink-0 pt-0.5 text-[10.5px] font-medium text-ink-tertiary">{label}</span>
      <span className="min-w-0 grow font-mono text-mono-sm leading-[18px] text-ink-tertiary">
        {value === null ? (
          <Hatch placeholder={field?.placeholder} />
        ) : (
          <MarkedSpan {...splitQuote(quote, value)} state={mark} />
        )}
      </span>
    </div>
  );
}
