"use client";

import { Icon } from "@/components/ui/icons";
import { MarkedSpan } from "@/components/ui/marked-span";
import type { ComparisonField } from "@/lib/api/runs-schemas";
import type { DocumentView } from "@/lib/api/trace-schemas";

import { fieldLabel } from "./field-label";
import type { FieldRowData } from "./field-row";
import { markOf, splitQuote } from "./field-reading";

const GRID = "grid grid-cols-[124px_minmax(0,1fr)_minmax(0,1fr)]";

interface ComparisonReportTableProps {
  rows: FieldRowData[];
  si: DocumentView | undefined;
  bl: DocumentView | undefined;
  selected: ComparisonField | null;
  onSelect: (field: ComparisonField) => void;
  onPreview: (document: DocumentView) => void;
}

export function ComparisonReportTable({ rows, si, bl, selected, onSelect, onPreview }: ComparisonReportTableProps) {
  return (
    <>
      <div className={`${GRID} h-11 shrink-0 items-stretch border-b border-hairline bg-surface`}>
        <span className="flex items-center border-r border-hairline px-3 text-caption text-ink-tertiary">Field</span>
        <Head document={si} role="SI" missing="no shipping instruction" onPreview={onPreview} bordered />
        <Head document={bl} role="BL" missing="no bill of lading" onPreview={onPreview} />
      </div>

      <div className="min-h-0 grow overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-3 py-4 text-small text-ink-tertiary">Nothing has been read from these documents yet.</p>
        ) : (
          rows.map((row) => (
            <Row key={row.judgement.field} row={row} selected={row.judgement.field === selected} onSelect={onSelect} />
          ))
        )}
      </div>
    </>
  );
}

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
            title={`View ${doc.filename}`}
            className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-accent-line bg-accent-tint px-2.5 text-caption font-medium text-accent transition-opacity duration-150 hover:opacity-75"
          >
            <Icon name="eye" size={12} />
            View file
          </button>
        </>
      ) : null}
    </span>
  );
}

function Row({ row, selected, onSelect }: { row: FieldRowData; selected: boolean; onSelect: (field: ComparisonField) => void }) {
  const { judgement } = row;
  const differs = !judgement.same && !judgement.missing;
  const mark = markOf(judgement, selected);

  return (
    <button
      type="button"
      onClick={() => onSelect(judgement.field)}
      aria-current={selected ? "true" : undefined}
      className={`${GRID} w-full cursor-pointer items-start border-b border-hairline-faint text-left transition-colors duration-150 hover:bg-sunken ${
        selected ? "bg-[#FFFBF0]" : ""
      }`}
    >
      <span className={`min-w-0 border-r border-hairline px-3 py-2 ${selected ? "shadow-[inset_2px_0_0_0_var(--ink)]" : ""}`}>
        <span className={`block truncate text-caption font-medium ${selected ? "text-ink" : differs ? "text-differ" : "text-ink-tertiary"}`}>
          {fieldLabel(judgement.field)}
        </span>
        <span className={`mt-0.5 block text-caption leading-[15px] ${differs ? "text-differ" : "text-ink-tertiary"}`}>
          {reportVerdictWords(row)}
        </span>
      </span>
      <Cell value={judgement.siValue} quote={row.si?.sourceQuote ?? null} mark={mark} bordered />
      <Cell value={judgement.blValue} quote={row.bl?.sourceQuote ?? null} mark={mark} />
    </button>
  );
}

function reportVerdictWords(row: FieldRowData): string {
  const { judgement } = row;
  if (judgement.missing) return "One value is missing";
  if (!judgement.same) return "Values differ";
  if (judgement.siValue !== null && judgement.blValue !== null && judgement.siValue !== judgement.blValue) return "Same meaning";
  return "Matches";
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
