import type { DocumentView, ReviewCaseView } from "@/lib/api/trace-schemas";

const REASON: Record<ReviewCaseView["reason"], string> = {
  wrong_doc_type: "an attachment is not the document it claims to be",
  missing_attachment: "the documents to compare did not arrive",
  unreadable: "a document could not be read",
  missing_value: "a required value is blank",
};

function DocumentRow({ doc }: { doc: DocumentView }) {
  const read = doc.unreadable ? "unreadable" : doc.scanned ? "read by OCR" : `${doc.format}, ${doc.pages} page${doc.pages === 1 ? "" : "s"}`;
  const typed = doc.docType ? `${doc.docType} at ${doc.docTypeConfidence?.toFixed(2) ?? "?"}` : "not typed";
  const disagrees = doc.docType !== null && doc.role !== "UNKNOWN" && doc.docType !== doc.role;
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-xs">{doc.filename}</span>
        <span className="text-xs text-muted">claims {doc.role}</span>
        <span className={`text-xs ${disagrees ? "font-medium text-amber-700" : "text-muted"}`}>model says {typed}</span>
        <span className={`text-xs ${doc.unreadable ? "text-red-700" : "text-muted"}`}>{read}</span>
      </div>
      {doc.docTypeRationale && <p className="mt-0.5 text-sm">{doc.docTypeRationale}</p>}
      {doc.warnings.length > 0 && <p className="mt-0.5 text-xs text-muted">{doc.warnings.join("; ")}</p>}
    </li>
  );
}

/** The email's attachments as the parser and the model saw them, and why it waits for a person when it does. */
export function DocumentsPanel({ documents, review }: { documents: DocumentView[]; review: ReviewCaseView | null }) {
  if (documents.length === 0 && !review) return null;
  return (
    <section className="rounded-lg border border-line bg-paper p-3">
      {review && (
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
          <span className="text-xs uppercase tracking-wide text-muted">Needs review</span>
          <span className="font-semibold text-amber-700">{review.reason}</span>
          <span className="text-sm text-muted">{REASON[review.reason]}</span>
        </div>
      )}
      {documents.length > 0 && (
        <>
          <div className="text-xs uppercase tracking-wide text-muted">Documents</div>
          <ul className="divide-y divide-line">
            {documents.map((doc) => (
              <DocumentRow key={doc.filename} doc={doc} />
            ))}
          </ul>
        </>
      )}
      {review && Object.keys(review.detail).length > 0 && (
        <details className="mt-2 rounded-md border border-line">
          <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            What the stage recorded
          </summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap wrap-break-word border-t border-line px-3 py-2 font-mono text-xs leading-relaxed">
            {JSON.stringify(review.detail, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}
