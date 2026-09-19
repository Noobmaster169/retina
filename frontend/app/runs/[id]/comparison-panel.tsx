import type { ComparisonView, ExtractionView, FieldJudgementView } from "@/lib/api/trace-schemas";

const STATUS: Record<ComparisonView["status"], string> = {
  OK: "text-accent-ink",
  MISMATCH: "text-red-700",
  NEEDS_REVIEW: "text-amber-700",
};

function verdictOf(f: FieldJudgementView): { text: string; className: string } {
  if (f.missing) return { text: "missing", className: "text-amber-700" };
  if (f.same) return { text: "same", className: "text-muted" };
  return { text: "different", className: "font-semibold text-red-700" };
}

/** The value as shown, with the extractor's quote and evidence on hover. */
function Value({ value, extracted }: { value: string | null; extracted: ExtractionView["fields"][number] | undefined }) {
  const title = extracted
    ? [
        extracted.sourceQuote ? `quoted from: ${extracted.sourceQuote}` : "no line quoted",
        `confidence ${extracted.confidence.toFixed(2)}`,
        extracted.evidenceOk ? "quote found in the document" : "quote not found in the document",
        extracted.note ? `note: ${extracted.note}` : null,
        extracted.humanValue ? `corrected by a person from: ${extracted.value ?? "(none)"}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : undefined;
  const shown = value ?? (extracted?.placeholder ? `"${extracted.placeholder}"` : "(none)");
  return (
    <span title={title} className={`${value === null ? "text-muted" : ""} ${extracted && !extracted.evidenceOk ? "underline decoration-dotted decoration-amber-700" : ""}`}>
      {shown}
    </span>
  );
}

/** The seven fields side by side with the judge's word on each. Shown as stored; nothing here is worked out. */
export function ComparisonPanel({ comparison, extractions }: { comparison: ComparisonView | null; extractions: ExtractionView[] }) {
  if (!comparison || comparison.fields.length === 0) return null;
  const si = extractions.find((x) => x.role === "SI");
  const bl = extractions.find((x) => x.role === "BL");
  const fieldOf = (doc: ExtractionView | undefined, field: string) => doc?.fields.find((f) => f.field === field);
  const verified = extractions.filter((x) => x.verified).map((x) => x.filename);

  return (
    <section className="rounded-lg border border-line bg-paper p-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-xs uppercase tracking-wide text-muted">Comparison</span>
        <span className={`font-semibold ${STATUS[comparison.status]}`}>{comparison.status}</span>
        {comparison.reviewReason && <span className="text-sm text-amber-700">{comparison.reviewReason}</span>}
        {comparison.defectFields.length > 0 && (
          <span className="font-mono text-xs text-muted">{comparison.defectFields.join(", ")}</span>
        )}
        {verified.length > 0 && <span className="text-xs text-muted">verifier ran on {verified.join(", ")}</span>}
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-line">
              <th className="py-1.5 pr-3 font-medium">Field</th>
              <th className="py-1.5 pr-3 font-medium">{si ? si.filename : "SI"}</th>
              <th className="py-1.5 pr-3 font-medium">{bl ? bl.filename : "BL"}</th>
              <th className="py-1.5 pr-3 font-medium">Judge</th>
              <th className="py-1.5 font-medium">Why</th>
            </tr>
          </thead>
          <tbody>
            {comparison.fields.map((f) => {
              const verdict = verdictOf(f);
              return (
                <tr key={f.field} className="border-b border-line align-top">
                  <td className="py-1.5 pr-3 font-mono text-xs">{f.field}</td>
                  <td className="py-1.5 pr-3 text-xs">
                    <Value value={f.siValue} extracted={fieldOf(si, f.field)} />
                  </td>
                  <td className="py-1.5 pr-3 text-xs">
                    <Value value={f.blValue} extracted={fieldOf(bl, f.field)} />
                  </td>
                  <td className={`py-1.5 pr-3 text-xs ${verdict.className}`}>
                    {verdict.text}
                    {f.confidence !== null && <span className="ml-1 tabular-nums text-muted">{f.confidence.toFixed(2)}</span>}
                  </td>
                  <td className="py-1.5 text-xs text-muted">{f.rationale}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
