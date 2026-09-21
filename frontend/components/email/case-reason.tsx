"use client";

import type { DocumentView, EmailTrace, ReviewCaseView } from "@/lib/api/trace-schemas";

/**
 * Why Retina stopped, in words, and then whatever answers that question for
 * this reason: the pages and what the parser saw for a file it could not read,
 * and what arrived for everything else.
 */

/**
 * `unreadable` now means what a person means by it: nobody could read this file,
 * a reader with eyes included. A scan with no text layer is not one of these any
 * more, because it is looked at and read; what reaches here either would not
 * open, or was looked at and could not be made out.
 */
function unreadableWhy(document: DocumentView | undefined): string {
  if (!document) return "A file could not be read, so there was nothing to compare.";
  const pages = `${document.pages} page${document.pages === 1 ? "" : "s"}`;
  if (document.scanned) {
    return `${document.filename} has no text in it, so its ${pages} ${document.pages === 1 ? "was" : "were"} looked at, and what is on them could not be made out. Nothing a person opening this file could read either, so no value was taken from it.`;
  }
  return `Nothing could be read from ${document.filename}. It would not open, so there was nothing to read and nothing to look at.`;
}

const REASONS: Record<string, (document: DocumentView | undefined) => string> = {
  unreadable: unreadableWhy,
  missing_value: () =>
    "A field the comparison needs is blank in one of the documents, or a placeholder stands where its value should be. A blank is an uncertainty and never a difference, so the pair was not judged on it.",
  missing_attachment: () => "The email asked for a check and one of the two documents is not attached.",
  wrong_doc_type: () =>
    "A file is not the document its name claims. Reading it as the other would compare two unrelated documents, so the pair was handed over instead.",
};

export function CaseReason({ trace, review }: { trace: EmailTrace; review: ReviewCaseView }) {
  // The document the case is about: the one nothing could be read from, else whatever arrived last.
  const unread = trace.documents.find((document) => document.unreadable) ?? trace.documents.at(-1);
  const why = REASONS[review.reason ?? ""]?.(unread) ?? `The ${review.stage} stage could not finish and handed this email to a person.`;

  return (
    <>
      <section className="border-t border-hairline-faint pl-3 pt-3 shadow-[inset_2px_0_0_0_var(--verdict-review)]">
        <h3 className="text-small font-medium text-ink-tertiary">Why</h3>
        <p className="mt-1.5 max-w-[68ch] text-body text-ink-secondary">{why}</p>
      </section>

      <section className="pl-3 pt-3.5">
        <h3 className="text-small font-medium text-ink-tertiary">What the parser saw</h3>
        <div className="mt-1.5">
          {trace.documents.length === 0 ? (
            <p className="text-small text-ink-tertiary">No attachment reached the parser.</p>
          ) : (
            trace.documents.map((document) => <ParserRows key={document.filename} document={document} />)
          )}
        </div>
      </section>
    </>
  );
}

/** What the parser made of one file, as rows a person can scan down. */
function ParserRows({ document }: { document: DocumentView }) {
  const rows: { key: string; value: string; alarming?: boolean }[] = [
    { key: "format", value: `${document.format}, ${document.pages} page${document.pages === 1 ? "" : "s"}` },
    { key: "read as", value: document.docType ?? "not typed", alarming: document.typeVerdict === "wrong_type" },
    {
      key: "how it was read",
      value: document.scanned ? "by looking at it: there is no text in the file" : "from the text in the file",
    },
    { key: "warnings", value: document.warnings.length ? document.warnings.join(", ") : "none" },
  ];
  return (
    <div className="mb-2">
      <div className="flex h-7 items-center gap-2 border-t border-hairline-faint">
        <span className="truncate font-mono text-mono-sm font-medium text-ink">{document.filename}</span>
        {document.origin === "human" ? <span className="shrink-0 text-caption text-ink-tertiary">supplied by a person</span> : null}
      </div>
      {rows.map((row) => (
        <div key={row.key} className="flex h-7 items-center border-t border-hairline-faint pl-3">
          <span className="w-[168px] shrink-0 font-mono text-mono-sm text-ink-tertiary">{row.key}</span>
          <span className={`min-w-0 grow truncate text-small ${row.alarming ? "text-review" : "text-ink-secondary"}`}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
