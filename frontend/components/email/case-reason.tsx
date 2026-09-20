"use client";

import { motion } from "motion/react";

import { EvidenceWell } from "@/components/ui/marked-span";
import type { DocumentView, EmailTrace, ReviewCaseView } from "@/lib/api/trace-schemas";
import { stagger } from "@/lib/motion";

/**
 * Why Retina stopped, in words, and then whatever answers that question for
 * this reason: the pages and what the parser saw for a file it could not read,
 * and what arrived for everything else.
 */

/**
 * Under this, doc-extract reads nothing off a page. Tesseract's own scale, 0 to
 * 100, and the same number services/doc-extract decides `unreadable` on; the
 * page shows it rather than restating the rule in its own units.
 */
export const OCR_FLOOR = 40;

/**
 * `unreadable` covers two different things, and a person acts on them
 * differently: a file nothing could be read from, and a file that was read by
 * OCR. The second is not a failure at all, it is Retina refusing to trust a
 * recognition it did not make itself. Saying "under the floor" for a scan that
 * came back at 87 percent would be plainly untrue.
 */
function unreadableWhy(document: DocumentView | undefined): string {
  if (!document) return "A file could not be read, so there was nothing to compare.";
  const one = document.pages === 1;
  const pages = `${document.pages} page${one ? "" : "s"}`;
  if (document.unreadable) {
    return `Nothing could be read from ${document.filename}. Its ${pages} went through OCR and came back under the ${OCR_FLOOR} percent floor, so no value was taken from it and there was nothing to compare.`;
  }
  return `${document.filename} is a scan with no text layer, so its ${pages} ${one ? "was" : "were"} read by OCR. Retina never settles a comparison on recognised text without a person seeing it, whatever the comparison came out as.`;
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
  // The document the case is about: the one nothing could be read from, else
  // the one read by OCR, else whatever arrived last.
  const unread =
    trace.documents.find((document) => document.unreadable) ?? trace.documents.find((document) => document.scanned) ?? trace.documents.at(-1);
  const why = REASONS[review.reason ?? ""]?.(unread) ?? `The ${review.stage} stage could not finish and handed this email to a person.`;

  return (
    <>
      <section className="border-t border-hairline-faint pl-3 pt-3 shadow-[inset_2px_0_0_0_var(--verdict-review)]">
        <h3 className="text-small font-medium text-ink-tertiary">Why</h3>
        <p className="mt-1.5 max-w-[68ch] text-body text-ink-secondary">{why}</p>
      </section>

      {unread && unread.pageConfidence.length > 0 ? <Pages document={unread} /> : null}

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

/**
 * The pages as page-shaped blocks with their own confidence under each. A page
 * is drawn rather than rendered: what the reader needs is which page failed and
 * how badly, and a photograph of an unreadable scan says neither.
 */
function Pages({ document }: { document: DocumentView }) {
  return (
    <section className="pl-3 pt-3.5">
      <h3 className="text-small font-medium text-ink-tertiary">What the pages look like</h3>
      <div className="mt-2 flex gap-3">
        {document.pageConfidence.map((confidence, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(index)}
            className="w-24 shrink-0"
          >
            <div className="hatch flex h-[124px] flex-col gap-1.5 overflow-hidden rounded-md border border-hairline-strong px-2.5 py-2.5" />
            <div className="mt-1.5 flex items-center">
              <span className="text-micro text-ink-tertiary">page {index + 1}</span>
              <span className="grow" />
              <span className={`text-micro tabular-nums ${confidence < OCR_FLOOR ? "text-review" : "text-ink-tertiary"}`}>
                {Math.round(confidence)}%
              </span>
            </div>
          </motion.div>
        ))}
        <div className="min-w-0 grow">
          <h4 className="text-small text-ink-tertiary">What the parser could not use</h4>
          <div className="mt-1.5">
            <EvidenceWell
              tone="review"
              quote={`The floor is ${OCR_FLOOR} percent. A page under it is not read from, because a value guessed off text that poor is worse than no value.`}
            />
          </div>
          <p className="mt-2.5 text-small leading-[18px] text-ink-tertiary">
            Retina will not read a value out of text this poor, so it asks rather than guesses.
          </p>
        </div>
      </div>
    </section>
  );
}

function ParserRows({ document }: { document: DocumentView }) {
  const mean = document.pageConfidence.length
    ? document.pageConfidence.reduce((sum, value) => sum + value, 0) / document.pageConfidence.length
    : null;
  const rows: { key: string; value: string; alarming?: boolean }[] = [
    { key: "format", value: `${document.format}, ${document.pages} page${document.pages === 1 ? "" : "s"}` },
    { key: "read as", value: document.docType ?? "not typed", alarming: document.typeVerdict === "wrong_type" },
    { key: "scanned", value: document.scanned ? "yes, there is no text layer" : "no, it has a text layer" },
    ...(mean === null ? [] : [{ key: "mean OCR confidence", value: `${Math.round(mean)}%, the floor is ${OCR_FLOOR}%`, alarming: mean < OCR_FLOOR }]),
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
