"use client";

import { useState } from "react";

import { MarkedSpan } from "@/components/ui/marked-span";
import type { ComparisonField } from "@/lib/api/runs-schemas";
import type { DocumentView, EmailTrace } from "@/lib/api/trace-schemas";

import { DocumentSheet } from "./document-sheet";
import { markOf, splitQuote, verdictWords } from "./field-reading";
import type { FieldRowData } from "./field-row";

/**
 * Both documents, line against line.
 *
 * One table and not a list beside two columns. The field rail this used to
 * carry named the same seven fields the columns already name, in the same
 * order, one pixel row apart: a second copy of the list, paid for in 152px and
 * in the reader deciding which of the two to look at. The field name is a
 * column now, the rows line up across all three, and clicking anywhere on a
 * row selects it.
 *
 * Every field stays on screen, agreeing or not, because this is the tab for
 * reading the two documents against each other and a check you cannot see is
 * a check you have to take on trust. Only the marking changes.
 */

const GRID = "grid grid-cols-[124px_minmax(0,1fr)_minmax(0,1fr)]";

interface DocumentsTabProps {
  trace: EmailTrace;
  rows: FieldRowData[];
}

export function DocumentsTab({ trace, rows }: DocumentsTabProps) {
  const [selected, setSelected] = useState(trace.comparison?.defectFields[0] ?? rows[0]?.judgement.field ?? null);
  const [previewing, setPreviewing] = useState<DocumentView | null>(null);
  const si = trace.documents.find((document) => document.role === "SI");
  const bl = trace.documents.find((document) => document.role === "BL");
  const chosen = rows.find((row) => row.judgement.field === selected);

  return (
    <div className="flex min-h-0 grow flex-col">
      <div className={`${GRID} h-11 shrink-0 items-stretch border-b border-hairline bg-surface`}>
        <span className="flex items-center border-r border-hairline px-3 text-caption text-ink-tertiary">Field</span>
        <Head document={si} role="SI" missing="no shipping instruction" onPreview={setPreviewing} bordered />
        <Head document={bl} role="BL" missing="no bill of lading" onPreview={setPreviewing} />
      </div>

      <div className="min-h-0 grow overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-3 py-4 text-small text-ink-tertiary">Nothing has been read from these documents yet.</p>
        ) : (
          rows.map((row) => (
            <Row key={row.judgement.field} row={row} selected={row.judgement.field === selected} onSelect={setSelected} />
          ))
        )}
      </div>

      <footer className="shrink-0 border-t border-hairline px-3 py-3">
        {chosen ? (
          <>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-[21px] items-center rounded-sm px-2 font-mono text-mono-xs ${
                  chosen.judgement.missing ? "bg-review-tint text-review" : chosen.judgement.same ? "bg-match-tint text-match" : "bg-differ-tint text-differ"
                }`}
              >
                {chosen.judgement.missing ? "missing" : chosen.judgement.same ? "the same" : "different"}
              </span>
              <span className="font-mono text-mono-xs text-ink-tertiary">{chosen.judgement.field}</span>
              {chosen.judgement.confidence === null ? null : (
                <span className="text-caption text-ink-tertiary">{chosen.judgement.confidence.toFixed(2)} sure</span>
              )}
              <span className="grow" />
              <span className="shrink-0 text-caption text-ink-tertiary">
                {chosen.si?.evidenceOk && chosen.bl?.evidenceOk ? "both quotes found in their documents" : "a quote could not be found in its document"}
              </span>
            </div>
            <p className="mt-1.5 max-w-[78ch] text-strong leading-5 text-ink-secondary">
              {chosen.judgement.rationale ?? "The judge recorded no reasoning for this field."}
            </p>
          </>
        ) : (
          <p className="text-small text-ink-tertiary">Choose a row to read what the judge made of it.</p>
        )}
      </footer>

      {previewing ? <DocumentSheet document={previewing} onClose={() => setPreviewing(null)} /> : null}
    </div>
  );
}

/** One document's column head: what it is, and the way into reading the whole of it. */
function Head({
  document: doc,
  role,
  missing,
  onPreview,
  bordered = false,
}: {
  document: DocumentView | undefined;
  role: string;
  missing: string;
  onPreview: (document: DocumentView) => void;
  bordered?: boolean;
}) {
  return (
    <span className={`flex min-w-0 items-center gap-2 px-3 ${bordered ? "border-r border-hairline" : ""}`}>
      <span className="inline-flex h-[19px] shrink-0 items-center rounded-xs border border-hairline bg-canvas px-1.5 font-mono text-[10px] text-ink-secondary">
        {role}
      </span>
      <span className="min-w-0 truncate font-mono text-mono-sm">{doc?.filename ?? missing}</span>
      <span className="grow" />
      {doc ? (
        <>
          <span className="shrink-0 text-micro text-ink-tertiary">
            {doc.format}, {doc.pages} page{doc.pages === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => onPreview(doc)}
            className="inline-flex h-[23px] shrink-0 items-center rounded-sm border border-hairline bg-canvas px-2 text-caption text-ink-secondary transition-colors duration-150 hover:border-hairline-strong hover:text-ink"
          >
            Open
          </button>
        </>
      ) : null}
    </span>
  );
}

/**
 * One field across both documents. The line each value was read from is shown
 * whole and only the value takes the mark: a row that shaded its background
 * would say the row is wrong, when two words are.
 */
function Row({ row, selected, onSelect }: { row: FieldRowData; selected: boolean; onSelect: (field: ComparisonField) => void }) {
  const { judgement } = row;
  const differs = !judgement.same && !judgement.missing;
  const mark = markOf(judgement, selected);

  return (
    <button
      type="button"
      onClick={() => onSelect(judgement.field)}
      aria-current={selected ? "true" : undefined}
      className={`${GRID} w-full items-start border-b border-hairline-faint text-left transition-colors duration-150 hover:bg-sunken ${
        selected ? "bg-[#FFFBF0]" : ""
      }`}
    >
      <span className={`min-w-0 border-r border-hairline px-3 py-2 ${selected ? "shadow-[inset_2px_0_0_0_var(--ink)]" : ""}`}>
        <span className={`block truncate font-mono text-micro ${selected ? "text-ink" : differs ? "text-differ" : "text-ink-tertiary"}`}>
          {judgement.field}
        </span>
        <span className={`mt-0.5 block text-caption leading-[15px] ${differs ? "text-differ" : "text-ink-tertiary"}`}>
          {verdictWords(judgement)}
        </span>
      </span>
      <Cell value={judgement.siValue} quote={row.si?.sourceQuote ?? null} mark={mark} bordered />
      <Cell value={judgement.blValue} quote={row.bl?.sourceQuote ?? null} mark={mark} />
    </button>
  );
}

function Cell({
  value,
  quote,
  mark,
  bordered = false,
}: {
  value: string | null;
  quote: string | null;
  mark: ReturnType<typeof markOf>;
  bordered?: boolean;
}) {
  return (
    <span className={`min-w-0 px-3 py-2 font-mono text-mono-sm leading-[18px] text-ink-tertiary ${bordered ? "border-r border-hairline" : ""}`}>
      {value === null ? <span className="text-ink-faint">nothing to compare</span> : <MarkedSpan {...splitQuote(quote, value)} state={mark} />}
    </span>
  );
}
