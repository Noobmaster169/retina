"use client";

import type { ReactNode } from "react";
import useSWR from "swr";

import type { DocumentView } from "@/lib/api/trace-schemas";
import { browserCanDraw, fileHref, textFetcher } from "@/lib/files";

/**
 * The two ways a stored document can be read, and the parts that draw either.
 *
 * Two readings, because they answer two questions. `As it arrived` is the file
 * the sender sent, which is what a person checks a draft against. `As the
 * parser read it` is the text every model in this product was given, which is
 * the honest answer to "why did it think that" and the only reading a
 * spreadsheet has at all: no browser draws xlsx or docx, and converting them
 * on the server to make a picture would be a third reading nobody asked for.
 *
 * Shared, because a document is read in two places now: the sheet that opens
 * over the page, and the documents tab, which embeds both files side by side.
 */

export type Reading = "arrived" | "parsed";

/** Whether any of these can be drawn as it arrived, and whether any has parsed text. A reading nothing can answer is not offered. */
export function readable(documents: DocumentView[]): { arrived: boolean; parsed: boolean } {
  return {
    arrived: documents.some((doc) => browserCanDraw(doc.format)),
    parsed: documents.some((doc) => doc.textObjectKey !== null),
  };
}

/** Which reading to open on: the files themselves where every one of them can be drawn, the parser's text otherwise. */
export function openingReading(documents: DocumentView[]): Reading {
  const can = readable(documents);
  if (documents.length > 0 && documents.every((doc) => browserCanDraw(doc.format))) return "arrived";
  return can.parsed ? "parsed" : "arrived";
}

export function ReadingPick({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "No file here has such a reading" : undefined}
      aria-pressed={on}
      className={`inline-flex h-[25px] items-center rounded-sm border px-2 text-caption transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? "border-hairline-strong bg-active font-medium text-ink" : "border-hairline text-ink-secondary hover:bg-sunken"
      }`}
    >
      {children}
    </button>
  );
}

/** One document at one reading, filling whatever it is given. */
export function DocumentBody({ document: doc, reading }: { document: DocumentView; reading: Reading }) {
  if (reading === "arrived") {
    if (!browserCanDraw(doc.format)) {
      return (
        <Note>
          No browser draws a {doc.format} file. Read it through the parser beside this, which is the text every model in this
          product was given, or download the original.
        </Note>
      );
    }
    const href = fileHref(doc.objectKey);
    if (doc.format === "pdf") return <iframe src={href} title={doc.filename} className="h-full w-full border-0 bg-sunken" />;
    return <Text href={href} />;
  }
  if (doc.textObjectKey === null) {
    return <Note>The parser could not read this file, so there is no text to show. Nothing was read from it and nothing was guessed.</Note>;
  }
  return <Text href={fileHref(doc.textObjectKey)} />;
}

function Text({ href }: { href: string }) {
  const { data, error, isLoading } = useSWR(href, textFetcher, { revalidateOnFocus: false });
  if (isLoading) return <Note>Reading it.</Note>;
  if (error instanceof Error) return <Note>{error.message}</Note>;
  return (
    <pre className="h-full overflow-auto whitespace-pre-wrap break-words px-5 py-4 font-mono text-mono-sm leading-[19px] text-ink-secondary">
      {data}
    </pre>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="max-w-[60ch] px-5 py-4 text-small leading-5 text-ink-tertiary">{children}</p>;
}
