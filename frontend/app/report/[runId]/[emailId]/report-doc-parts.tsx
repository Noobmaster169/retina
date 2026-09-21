import { claimedRoleLabel, docTypeLabel } from "@/components/email/report-eligible";
import type { DocumentView } from "@/lib/api/trace-schemas";

export function ReportSection({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-3 break-after-avoid border-b border-hairline pb-2">
        <h2 className="text-heading font-semibold">{title}</h2>
        {intro ? <p className="mt-0.5 text-caption text-ink-tertiary">{intro}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function DocumentValue({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md bg-sunken px-3 py-2.5">
      <p className="text-caption font-medium text-ink-tertiary">{label}</p>
      <p className="mt-1 break-words text-small font-medium leading-5">{value ?? "Not provided"}</p>
    </div>
  );
}

export function WrongDocumentSection({ documents }: { documents: DocumentView[] }) {
  return (
    <ReportSection title="Wrong document" intro="These files were read before any field comparison was run.">
      <div className="space-y-3">
        {documents.map((document) => (
          <article key={document.filename} className="break-inside-avoid rounded-lg border border-hairline-strong p-4">
            <div className="flex items-center gap-3">
              <h3 className="break-words font-mono text-mono-sm font-medium">{document.filename}</h3>
              <span className="grow" />
              {document.docTypeConfidence === null ? null : (
                <span className="text-caption text-ink-tertiary">{Math.round(document.docTypeConfidence * 100)}% confidence</span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <DocumentValue label="Named as" value={claimedRoleLabel(document.role)} />
              <DocumentValue label="Read as" value={docTypeLabel(document.docType)} />
            </div>
            {document.docTypeRationale ? (
              <p className="mt-3 border-t border-hairline pt-3 text-small leading-5 text-ink-secondary">
                <span className="font-medium text-ink">Why this was flagged: </span>
                {document.docTypeRationale}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </ReportSection>
  );
}
