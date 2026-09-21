import { classificationLabel } from "@/components/email/classification-chip";
import { displayLabel } from "@/components/email/display-label";
import { statusOf } from "@/components/email/email-reading";
import { fieldLabel } from "@/components/email/field-label";
import { wrongDocType, wrongDocuments } from "@/components/email/report-eligible";
import { senderAddress } from "@/components/email/sender";
import { tallyFields } from "@/components/report/report-figures";
import type { Email } from "@/lib/api/mail-client";
import type { EmailTrace } from "@/lib/api/trace-schemas";

import { DocumentValue, ReportSection, WrongDocumentSection } from "./report-doc-parts";
import { ROLE_ORDER, roleLabel, statusStyle, summaryText, summaryTitle, verdict, verdictStyle } from "./report-display";

/** A concise, client-ready account of one document check. */
export function ReportDoc({ trace, email }: { trace: EmailTrace; email: Email | null }) {
  const status = statusOf(trace);
  const fields = trace.comparison?.fields ?? [];
  const tally = tallyFields(fields);
  const differing = fields.filter((field) => !field.same && !field.missing);
  const wrongDocument = wrongDocType(trace) && fields.length === 0;
  const flagged = wrongDocuments(trace);
  const category = trace.classification?.humanCategory ?? trace.classification?.finalCategory ?? null;
  const documents = [...trace.documents].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

  return (
    <article className="mx-auto max-w-[820px] px-8 py-10 print:px-0 print:py-0">
      <header className="border-b border-hairline-strong pb-5">
        <div className="flex items-center gap-3">
          <div>
            <p className="font-display text-[22px] leading-7">Retina</p>
            <p className="text-caption text-ink-tertiary">Document comparison report</p>
          </div>
          <span className="grow" />
          <span className={`rounded-full border px-3 py-1 text-caption font-medium ${statusStyle(status.tone)}`}>
            {status.value}
          </span>
        </div>

        <h1 className="mt-5 max-w-[68ch] text-[19px] font-semibold leading-7 tracking-[-0.01em]">
          {email?.subject ?? "Email document check"}
        </h1>
        <p className="mt-1.5 text-small text-ink-secondary">
          {email ? senderAddress(email.from) : "Unknown sender"}
          {category ? ` / ${classificationLabel(category)}` : ""}
        </p>
      </header>

      <section
        className={`mt-6 break-inside-avoid rounded-lg border px-5 py-4 ${
          wrongDocument || tally.missing > 0
            ? "border-review-line bg-review-tint"
            : differing.length > 0
              ? "border-differ-line bg-differ-tint"
              : "border-match-line bg-match-tint"
        }`}
      >
        <p className="text-caption font-medium uppercase tracking-[0.06em] text-ink-secondary">Summary</p>
        <h2 className="mt-1 text-[17px] font-semibold leading-6">{summaryTitle(tally, status.value, wrongDocument)}</h2>
        <p className="mt-1 max-w-[72ch] text-body leading-6 text-ink-secondary">{summaryText(tally, fields.length, wrongDocument)}</p>
      </section>

      {wrongDocument ? <WrongDocumentSection documents={flagged.length > 0 ? flagged : documents} /> : null}

      {differing.length > 0 ? (
        <ReportSection title="Items to review" intro="These values do not match across the two documents.">
          <div className="space-y-3">
            {differing.map((field) => (
              <article key={field.field} className="break-inside-avoid rounded-lg border border-hairline-strong p-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-heading font-semibold">{fieldLabel(field.field)}</h3>
                  <span className="grow" />
                  {field.confidence === null ? null : (
                    <span className="text-caption text-ink-tertiary">{Math.round(field.confidence * 100)}% confidence</span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <DocumentValue label="Shipping instruction" value={field.siValue} />
                  <DocumentValue label="Bill of lading" value={field.blValue} />
                </div>
                {field.rationale ? (
                  <p className="mt-3 border-t border-hairline pt-3 text-small leading-5 text-ink-secondary">
                    <span className="font-medium text-ink">Why this was flagged: </span>
                    {field.rationale}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </ReportSection>
      ) : null}

      {fields.length > 0 ? (
        <ReportSection title="Full comparison" intro="A field-by-field view of the information found in each document.">
          <div className="overflow-hidden rounded-lg border border-hairline-strong">
            <table className="w-full table-fixed border-collapse text-left">
              <thead className="bg-sunken">
                <tr className="border-b border-hairline-strong text-caption text-ink-secondary">
                  <th className="w-[22%] px-3 py-2 font-medium">Field</th>
                  <th className="w-[15%] px-3 py-2 font-medium">Result</th>
                  <th className="w-[31.5%] px-3 py-2 font-medium">Shipping instruction</th>
                  <th className="w-[31.5%] px-3 py-2 font-medium">Bill of lading</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr
                    key={field.field}
                    className={`break-inside-avoid border-b border-hairline align-top last:border-b-0 ${
                      !field.same && !field.missing ? "bg-differ-tint" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5 text-small font-medium">{fieldLabel(field.field)}</td>
                    <td className={`px-3 py-2.5 text-caption font-medium ${verdictStyle(field.same, field.missing)}`}>
                      {verdict(field.same, field.missing)}
                    </td>
                    <td className="break-words px-3 py-2.5 text-small leading-5">{field.siValue ?? "Not provided"}</td>
                    <td className="break-words px-3 py-2.5 text-small leading-5">{field.blValue ?? "Not provided"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ReportSection>
      ) : null}

      {trace.review ? (
        <ReportSection title="Action required">
          <div className="break-inside-avoid rounded-lg border border-review-line bg-review-tint px-4 py-3">
            <p className="text-small leading-5">
              {trace.review.kind === "failure"
                ? "The automated check stopped before it could finish. Please review the source documents."
                : `A person needs to review ${
                    trace.review.reason ? displayLabel(trace.review.reason).toLowerCase() : "this check"
                  } before the report can be finalized.`}
            </p>
          </div>
        </ReportSection>
      ) : null}

      {documents.length > 0 ? (
        <ReportSection title="Source documents" intro="The files used for this comparison.">
          <div className="grid grid-cols-2 gap-3">
            {documents.map((document) => (
              <div key={document.filename} className="break-inside-avoid rounded-lg border border-hairline-strong px-4 py-3">
                <p className="text-caption font-medium text-ink-secondary">{roleLabel(document.role)}</p>
                <p className="mt-1 break-words font-mono text-mono-sm">{document.filename}</p>
                <p className="mt-1 text-caption text-ink-tertiary">
                  {document.format.toUpperCase()} / {document.pages} page{document.pages === 1 ? "" : "s"}
                  {document.scanned ? " / Read from a scan" : ""}
                  {document.unreadable ? " / Could not be read" : ""}
                </p>
              </div>
            ))}
          </div>
        </ReportSection>
      ) : null}

      <footer className="mt-8 break-inside-avoid border-t border-hairline-strong pt-3 text-caption leading-5 text-ink-tertiary">
        Review highlighted differences against the original documents before taking action.
      </footer>
    </article>
  );
}
