"use client";

import { useState } from "react";
import { motion } from "motion/react";

import { MarkedSpan, type MarkState } from "@/components/ui/marked-span";
import type { EmailTrace } from "@/lib/api/trace-schemas";
import { panel } from "@/lib/motion";

import { markOf, splitQuote, verdictWords } from "./field-reading";
import type { FieldRowData } from "./field-row";

/**
 * Both documents, in the same palette and type as everything else. The seven
 * fields become the left column, and the selected one is filled on both sides.
 *
 * There is no document text to lay out yet: what each value was read from is
 * its quote, which is the line it came from and is what the evidence check
 * already proved is in the file. So the two columns are the quotes, in field
 * order, which is the part a person comparing two documents is actually
 * reading.
 */

interface DocumentsTabProps {
  trace: EmailTrace;
  rows: FieldRowData[];
}

export function DocumentsTab({ trace, rows }: DocumentsTabProps) {
  const [selected, setSelected] = useState(trace.comparison?.defectFields[0] ?? rows[0]?.judgement.field ?? null);
  const si = trace.documents.find((document) => document.role === "SI");
  const bl = trace.documents.find((document) => document.role === "BL");
  const chosen = rows.find((row) => row.judgement.field === selected);

  return (
    <div className="flex min-h-0 grow flex-col">
      <div className="flex min-h-0 grow overflow-hidden">
        <nav className="flex w-[152px] shrink-0 flex-col border-r border-hairline" aria-label="The seven fields">
          <div className="flex h-10 shrink-0 items-center px-3">
            <span className="text-small font-medium text-ink-tertiary">The seven fields</span>
          </div>
          {rows.map((row) => {
            const differs = !row.judgement.same && !row.judgement.missing;
            const active = row.judgement.field === selected;
            return (
              <button
                key={row.judgement.field}
                type="button"
                onClick={() => setSelected(row.judgement.field)}
                aria-current={active}
                className={`relative h-[46px] shrink-0 border-t border-hairline-faint px-3 text-left transition-colors duration-150 hover:bg-sunken ${
                  active ? "bg-sunken shadow-[inset_2px_0_0_0_var(--ink)]" : ""
                }`}
              >
                <span
                  className={`block truncate font-mono text-micro ${
                    active ? "text-ink" : differs ? "text-differ" : "text-ink-tertiary"
                  }`}
                >
                  {row.judgement.field}
                </span>
                <span className={`mt-0.5 block text-caption ${differs ? "text-differ" : "text-ink-tertiary"}`}>
                  {verdictWords(row.judgement)}
                </span>
              </button>
            );
          })}
          <span className="grow" />
          <p className="border-t border-hairline px-3 py-3 text-caption leading-[17px] text-ink-tertiary">
            The model judged each field on its own. Code only collected the ones it called different.
          </p>
        </nav>

        <Column
          label="SI"
          filename={si?.filename ?? "no shipping instruction"}
          meta={si ? `${si.format}, ${si.pages} page${si.pages === 1 ? "" : "s"}` : ""}
          rows={rows}
          selected={selected}
          side="si"
          bordered
        />
        <Column
          label="BL"
          filename={bl?.filename ?? "no bill of lading"}
          meta={bl ? `${bl.format}, ${bl.pages} page${bl.pages === 1 ? "" : "s"}` : ""}
          rows={rows}
          selected={selected}
          side="bl"
        />
      </div>

      <footer className="flex shrink-0 gap-5 border-t border-hairline px-[22px] py-3">
        <div className="w-[152px] shrink-0 pr-4">
          <div className="text-small font-medium text-ink-tertiary">What the judge said</div>
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className={`inline-flex h-[21px] items-center rounded-sm px-2 font-mono text-mono-xs ${
                chosen?.judgement.same ? "bg-match-tint text-match" : "bg-differ-tint text-differ"
              }`}
            >
              {chosen?.judgement.missing ? "missing" : chosen?.judgement.same ? "the same" : "different"}
            </span>
            {chosen?.judgement.confidence === null || chosen?.judgement.confidence === undefined ? null : (
              <span className="text-caption text-ink-tertiary">{chosen.judgement.confidence.toFixed(2)} sure</span>
            )}
          </div>
        </div>
        <div className="min-w-0 grow">
          <p className="max-w-[68ch] text-strong leading-5 text-ink-secondary">
            {chosen?.judgement.rationale ?? "Select a field to read what the judge made of it."}
          </p>
          <div className="mt-1.5 flex items-center gap-2 text-caption text-ink-tertiary">
            <span>Evidence</span>
            <span className="font-mono text-micro text-ink-secondary">
              {chosen?.si?.evidenceOk && chosen?.bl?.evidenceOk
                ? "both quotes were found in their documents"
                : "one quote could not be found in its document"}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Column({
  label,
  filename,
  meta,
  rows,
  selected,
  side,
  bordered = false,
}: {
  label: string;
  filename: string;
  meta: string;
  rows: FieldRowData[];
  selected: string | null;
  side: "si" | "bl";
  bordered?: boolean;
}) {
  return (
    <div className={`flex min-w-0 grow basis-0 flex-col ${bordered ? "border-r border-hairline" : ""}`}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3">
        <span className="inline-flex h-[19px] shrink-0 items-center rounded-xs border border-hairline bg-canvas px-1.5 font-mono text-[10px] text-ink-secondary">
          {label}
        </span>
        <span className="min-w-0 truncate font-mono text-mono-sm">{filename}</span>
        <span className="grow" />
        <span className="shrink-0 text-micro text-ink-tertiary">{meta}</span>
      </div>
      <div className="min-h-0 grow overflow-y-auto py-2">
        {rows.map((row) => {
          const field = side === "si" ? row.si : row.bl;
          const value = side === "si" ? row.judgement.siValue : row.judgement.blValue;
          const active = row.judgement.field === selected;
          const mark: MarkState = markOf(row.judgement, active);
          return (
            <motion.div
              key={row.judgement.field}
              layout
              transition={panel}
              className={`flex min-h-[22px] items-start px-3 py-1 ${active ? "bg-[#FFFBF0]" : ""}`}
            >
              <span className="min-w-0 font-mono text-mono-sm leading-[18px] text-ink-tertiary">
                {value === null ? (
                  <span className="text-ink-faint">nothing to compare</span>
                ) : (
                  <MarkedSpan {...splitQuote(field?.sourceQuote ?? null, value)} state={mark} />
                )}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
