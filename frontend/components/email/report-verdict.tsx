import { fieldLabel } from "./field-label";
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

export function ReportVerdict({ chosen }: { chosen: FieldRowData | undefined }) {
  if (!chosen) {
    return (
      <section className="shrink-0 border-b border-hairline bg-surface px-4 py-3">
        <p className="text-small text-ink-tertiary">Select a field below to see how Retina reached its reading.</p>
      </section>
    );
  }

  const { judgement } = chosen;
  const kind = judgement.missing ? "missing" : judgement.same ? "same" : "differ";
  const unquoted = !chosen.si?.evidenceOk || !chosen.bl?.evidenceOk;

  return (
    <section className="shrink-0 border-b border-hairline bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex h-[22px] shrink-0 items-center rounded-sm px-2 text-caption font-medium ${TINT[kind]}`}>
          {judgement.missing ? "Could not compare" : judgement.same ? "Matches" : "Different"}
        </span>
        <h2 className="text-strong font-medium text-ink">{fieldLabel(judgement.field)}</h2>
        {judgement.confidence === null ? null : (
          <span className="shrink-0 text-caption text-ink-tertiary">{Math.round(judgement.confidence * 100)}% confidence</span>
        )}
        {unquoted ? (
          <span className="text-caption text-review">Source text was unavailable for one document.</span>
        ) : null}
      </div>
      <p className="mt-2 max-w-[92ch] text-strong leading-5 text-ink">
        {judgement.rationale ?? "No explanation was recorded for this field."}
      </p>
    </section>
  );
}
