"use client";

import { motion } from "motion/react";

import { Chip } from "@/components/ui/chip";
import { EvidenceWell } from "@/components/ui/marked-span";
import type { DocumentView, EmailTrace, ReviewCaseView } from "@/lib/api/trace-schemas";
import { stagger } from "@/lib/motion";

import { type FileSizes, MessageCard, type Message } from "./message-card";
import { Reading, Seam } from "./seam";

/**
 * The same page as the check, with a case instead. Under the seam the reading
 * comes first in words, then why Retina stopped, then the pages with their own
 * OCR confidence, then what the parser saw.
 *
 * Violet throughout. This is uncertainty handed to a person, not a fault:
 * section 4.4 keeps red for a job that failed and never lets amber and violet
 * share a badge.
 */

interface CaseTabProps {
  trace: EmailTrace;
  message: Message;
  sizes: FileSizes;
  review: ReviewCaseView;
}

export function CaseTab({ trace, message, sizes, review }: CaseTabProps) {
  const unread = trace.documents.find((document) => document.unreadable) ?? trace.documents.at(-1);
  return (
    <div className="px-6">
      <div className="pt-4">
        <MessageCard message={message} sizes={sizes} />
      </div>
      <Seam />
      <Reading facts={factsOf(trace, review)}>{readingOf(trace)}</Reading>

      <div className="flex h-[34px] items-center">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Retina stopped here</h2>
        <span className="ml-2 text-small text-ink-tertiary">
          Opened {opened(review.openedAt)}, nobody assigned
        </span>
        <span className="grow" />
        <Chip tone="review" mono>
          {review.reason}
        </Chip>
      </div>

      <section className="border-t border-hairline-faint pl-3 pt-3 shadow-[inset_2px_0_0_0_var(--verdict-review)]">
        <h3 className="text-small font-medium text-ink-tertiary">Why</h3>
        <p className="mt-1.5 max-w-[68ch] text-body text-ink-secondary">{why(review, unread)}</p>
      </section>

      {unread && unread.pageConfidence.length > 0 ? <Pages document={unread} /> : null}

      <section className="pl-3 pt-3.5">
        <h3 className="text-small font-medium text-ink-tertiary">What the parser saw</h3>
        <div className="mt-1.5">
          {unread ? (
            parserRows(unread).map((row) => (
              <div key={row.key} className="flex h-7 items-center border-t border-hairline-faint">
                <span className="w-[180px] shrink-0 font-mono text-mono-sm text-ink-tertiary">{row.key}</span>
                <span className={`min-w-0 grow truncate text-small ${row.alarming ? "text-review" : "text-ink-secondary"}`}>
                  {row.value}
                </span>
              </div>
            ))
          ) : (
            <p className="text-small text-ink-tertiary">No attachment reached the parser.</p>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * The pages as page-shaped blocks with their own confidence under each. A page
 * is drawn rather than rendered: what the reader needs is which page failed and
 * how badly, and a photograph of an unreadable scan says neither.
 */
function Pages({ document }: { document: DocumentView }) {
  const floor = 0.4;
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
              <span className={`text-micro tabular-nums ${confidence < floor ? "text-review" : "text-ink-tertiary"}`}>
                {Math.round(confidence * 100)}%
              </span>
            </div>
          </motion.div>
        ))}
        <div className="min-w-0 grow">
          <h4 className="text-small text-ink-tertiary">What the parser could not use</h4>
          <div className="mt-1.5">
            <EvidenceWell
              tone="review"
              quote={`The floor is ${Math.round(floor * 100)} percent. Every page came back under it, so no value was read from this file.`}
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

function parserRows(document: DocumentView): { key: string; value: string; alarming?: boolean }[] {
  const mean = document.pageConfidence.length
    ? document.pageConfidence.reduce((sum, value) => sum + value, 0) / document.pageConfidence.length
    : null;
  return [
    { key: "format", value: document.format },
    { key: "pages", value: String(document.pages) },
    { key: "scanned", value: document.scanned ? "yes, there is no text layer" : "no, it has a text layer" },
    ...(mean === null ? [] : [{ key: "mean OCR confidence", value: `${Math.round(mean * 100)}%, the floor is 40%`, alarming: mean < 0.4 }]),
    { key: "warnings", value: document.warnings.length ? document.warnings.join(", ") : "none" },
  ];
}

function readingOf(trace: EmailTrace): string {
  const readable = trace.documents.filter((document) => !document.unreadable).length;
  const opened = trace.documents.length;
  if (opened === 0) return "No attachment reached the parser, so there was nothing to compare.";
  return `${readable} of the ${opened} attachment${opened === 1 ? "" : "s"} read cleanly. Nothing was guessed from the rest.`;
}

function factsOf(trace: EmailTrace, review: ReviewCaseView) {
  const unread = trace.documents.find((document) => document.unreadable);
  const mean = unread?.pageConfidence.length
    ? unread.pageConfidence.reduce((sum, value) => sum + value, 0) / unread.pageConfidence.length
    : null;
  return [
    { label: "parked as", value: review.reason, tone: "review" as const },
    ...(unread ? [{ label: "pages read by OCR", value: `${unread.pageConfidence.length} of ${unread.pages}` }] : []),
    ...(mean === null ? [] : [{ label: "mean confidence", value: `${Math.round(mean * 100)}%`, tone: "fault" as const }]),
  ];
}

const REASONS: Record<string, (document: DocumentView | undefined) => string> = {
  unreadable: (document) =>
    `The file is a scan with no text in it. ${document?.pages ?? "Its"} page${document && document.pages === 1 ? "" : "s"} went through OCR and came back under the confidence floor, so nothing was read from it and there was nothing to compare.`,
  missing_value: () =>
    "A field the comparison needs is blank in one of the documents, or a placeholder stands where its value should be. A blank is an uncertainty and never a difference, so the pair was not judged on it.",
  missing_attachment: () => "The email asked for a check and one of the two documents is not attached.",
  wrong_doc_type: () =>
    "A file is not the document its name claims. Reading it as the other would compare two unrelated documents, so the pair was handed over instead.",
};

function why(review: ReviewCaseView, document: DocumentView | undefined): string {
  return REASONS[review.reason]?.(document) ?? `The ${review.stage} stage could not finish and handed this email to a person.`;
}

function opened(at: string): string {
  const minutes = Math.round((Date.now() - Date.parse(at)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  return new Date(at).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
