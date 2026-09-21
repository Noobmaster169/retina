"use client";

import { Icon } from "@/components/ui/icons";

import type { FieldRowData } from "./field-row";

/**
 * The bar under the report: what the judge made of the chosen row, and the
 * document it can leave as.
 *
 * Its own file because it is its own thing: the table above answers what the
 * two documents say and this answers why that was called agreement or not.
 * `Recommend action` lives on the check tab's own footer now, not here: this
 * bar changes with every row clicked and a primary action that moved under the
 * reader's cursor mid-read is not where a decision like that belongs.
 *
 * The judge's sentence is the subject here, so it is set in ink and given the
 * width to be read. Everything around it earns its place or is gone: the
 * evidence check is drawn only when a quote was not found, because "both
 * quotes found in their documents" on every settled row is a line nobody ever
 * needed to read twice.
 */

const TINT = {
  missing: "bg-review-tint text-review",
  same: "bg-match-tint text-match",
  differ: "bg-differ-tint text-differ",
} as const;

export function ReportVerdict({ chosen, runId, emailId }: {
  chosen: FieldRowData | undefined;
  runId: string;
  emailId: string;
}) {
  if (!chosen) {
    return (
      <footer className="flex shrink-0 items-center gap-2 border-t border-hairline bg-surface px-4 py-3">
        <p className="text-small text-ink-tertiary">Choose a row to read what the judge made of it.</p>
        <span className="grow" />
        <ExportLink runId={runId} emailId={emailId} />
      </footer>
    );
  }

  const { judgement } = chosen;
  const kind = judgement.missing ? "missing" : judgement.same ? "same" : "differ";
  const unquoted = !chosen.si?.evidenceOk || !chosen.bl?.evidenceOk;

  return (
    <footer className="shrink-0 border-t border-hairline bg-surface px-4 py-3">
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-[21px] shrink-0 items-center rounded-sm px-2 font-mono text-mono-xs ${TINT[kind]}`}>
          {judgement.missing ? "nothing to compare" : judgement.same ? "the same" : "different"}
        </span>
        <span className="min-w-0 truncate font-mono text-mono-xs text-ink-secondary">{judgement.field}</span>
        {judgement.confidence === null ? null : (
          <span className="shrink-0 text-caption text-ink-tertiary">{judgement.confidence.toFixed(2)} sure</span>
        )}
        {unquoted ? (
          <span className="shrink-0 text-caption text-review">a quote could not be found in its document</span>
        ) : null}
        <span className="grow" />
        <ExportLink runId={runId} emailId={emailId} />
      </div>
      <p className="mt-2 max-w-[92ch] text-strong leading-5 text-ink">
        {judgement.rationale ?? "The judge recorded no reasoning for this field."}
      </p>
    </footer>
  );
}

/**
 * The way out of the product: this check as a document, in its own tab, which
 * opens the browser's print dialog on arrival. The export is a print to PDF
 * and not a file drawn in JavaScript, so the type is real and the text in the
 * saved file can still be searched and copied.
 */
function ExportLink({ runId, emailId }: { runId: string; emailId: string }) {
  return (
    <a
      href={`/report/${runId}/${emailId}?print=1`}
      target="_blank"
      rel="noreferrer"
      title="The diff and what the judge made of it, as one page to print or send"
      className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-sm border border-hairline-strong px-2.5 text-caption text-ink-secondary transition-colors duration-150 hover:border-ink-faint hover:text-ink"
    >
      <Icon name="doc" size={11} />
      Export
    </a>
  );
}
