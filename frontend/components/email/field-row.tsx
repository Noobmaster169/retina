"use client";

import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Hatch, MarkedSpan, type MarkState } from "@/components/ui/marked-span";
import type { ExtractedFieldView, FieldJudgementView } from "@/lib/api/comparison-schemas";
import { panel } from "@/lib/motion";

import { collapsedLine, markOf, splitQuote } from "./field-reading";
import { FieldCorrection } from "./field-correction";

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
  /** When true the row stays expanded and the header does not collapse. Used for every differing field on the check tab. */
  alwaysOpen?: boolean;
  /** Present only while a case is waiting for a person: a correction is a review action, not a way to edit a finished check. */
  correcting?: { active: boolean; pending: boolean; onOpen: () => void; onClose: () => void; onRecord: (side: "SI" | "BL", value: string) => void };
}

export function FieldRow({ row, open, onToggle, alwaysOpen = false, correcting }: FieldRowProps) {
  const { judgement } = row;
  const expanded = alwaysOpen || open;
  const mark = markOf(judgement, expanded);
  const rail = judgement.missing
    ? "shadow-[inset_2px_0_0_0_var(--verdict-review)]"
    : judgement.same
      ? ""
      : "shadow-[inset_2px_0_0_0_var(--verdict-differ)]";

  const header = alwaysOpen ? (
    <span className="font-mono text-[12px] font-medium text-ink">{judgement.field}</span>
  ) : (
    <>
      <span className={`font-mono text-[12px] ${expanded ? "font-medium text-ink" : "text-ink-secondary"}`}>
        {judgement.field}
      </span>
      <span className={`min-w-0 grow truncate text-small ${judgement.same ? "font-mono text-mono-sm text-ink-tertiary" : "text-ink-tertiary"}`}>
        {expanded ? "" : collapsedLine(judgement)}
      </span>
      <span className={`shrink-0 text-small ${judgement.same ? "text-ink-tertiary" : "text-differ"}`}>
        {judgement.missing ? "nothing to compare" : judgement.same ? "agree" : "differ"}
      </span>
    </>
  );

  const body = (
    <div className="pb-2.5">
      <Side label="SI" value={judgement.siValue} field={row.si} mark={mark} />
      <Side label="BL" value={judgement.blValue} field={row.bl} mark={mark} />
      {correcting?.active ? (
        <FieldCorrection
          judgement={judgement}
          human={{ SI: row.si?.humanValue ?? null, BL: row.bl?.humanValue ?? null }}
          pending={correcting.pending}
          onRecord={correcting.onRecord}
          onCancel={correcting.onClose}
        />
      ) : correcting ? (
        <div className="ml-[27px] mt-1.5">
          <Button variant="quiet" className="h-6 px-1.5" onClick={correcting.onOpen}>
            Correct what a document reads
          </Button>
        </div>
      ) : null}
      {judgement.rationale ? (
        <p className="ml-[27px] mt-1.5 max-w-[68ch] text-small leading-[17px] text-ink-secondary">
          {judgement.rationale}
          {judgement.confidence === null ? null : (
            <span className="ml-1.5 text-ink-tertiary">{judgement.confidence.toFixed(2)} sure</span>
          )}
        </p>
      ) : null}
    </div>
  );

  const shell = alwaysOpen
    ? "border-l-2 border-differ bg-differ-tint/25 py-2 pl-3"
    : `border-t border-hairline-faint ${expanded ? `pl-3 ${rail}` : ""}`;

  return (
    <div className={shell}>
      {alwaysOpen ? (
        <div className="mb-1 flex w-full items-center text-left">{header}</div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className={`flex w-full items-center gap-2.5 text-left ${expanded ? "h-7" : "h-8"}`}
        >
          {header}
        </button>
      )}

      {alwaysOpen ? (
        body
      ) : (
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={panel}
              className="overflow-hidden"
            >
              {body}
            </motion.div>
          ) : null}
        </AnimatePresence>
      )}
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
