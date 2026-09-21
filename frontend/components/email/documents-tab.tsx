"use client";

import { useState } from "react";

import type { DocumentView, EmailTrace } from "@/lib/api/trace-schemas";
import { fileHref } from "@/lib/files";

import { DocumentBody, Note, openingReading, readable, ReadingPick, type Reading } from "./document-reading";

/**
 * Both documents, as they are, side by side.
 *
 * The two files themselves and not a table about them: the report tab holds
 * the seven fields and what the judge made of each, and this is where a person
 * goes to see what those values were read out of. Opening a sheet over the
 * page to read one, then closing it to read the other, was never reading them
 * against each other.
 *
 * One reading control and not two. The question this tab answers is what the
 * two say about the same thing, and a switch per column would let someone
 * compare a PDF against a parser transcript without noticing. A file with no
 * such reading says so in its own column rather than taking the other one's
 * reading away.
 */

interface DocumentsTabProps {
  trace: EmailTrace;
}

export function DocumentsTab({ trace }: DocumentsTabProps) {
  const [reading, setReading] = useState<Reading>(() => openingReading(trace.documents));
  const can = readable(trace.documents);
  const si = trace.documents.find((document) => document.role === "SI");
  const bl = trace.documents.find((document) => document.role === "BL");

  return (
    <div className="flex min-h-0 grow flex-col">
      <div className="flex h-[38px] shrink-0 items-center gap-1 border-b border-hairline px-3">
        <ReadingPick on={reading === "arrived"} disabled={!can.arrived} onClick={() => setReading("arrived")}>
          As they arrived
        </ReadingPick>
        <ReadingPick on={reading === "parsed"} disabled={!can.parsed} onClick={() => setReading("parsed")}>
          As the parser read them
        </ReadingPick>
      </div>

      <div className="grid min-h-0 grow grid-cols-1 md:grid-cols-2">
        <Side document={si} role="SI" missing="no shipping instruction" reading={reading} bordered />
        <Side document={bl} role="BL" missing="no bill of lading" reading={reading} />
      </div>
    </div>
  );
}

/** One column: which document it is, and the document. */
function Side({
  document: doc,
  role,
  missing,
  reading,
  bordered = false,
}: {
  document: DocumentView | undefined;
  role: string;
  missing: string;
  reading: Reading;
  bordered?: boolean;
}) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-col ${bordered ? "border-r border-hairline" : ""}`}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-3">
        <span className="inline-flex h-[19px] shrink-0 items-center rounded-xs border border-hairline bg-canvas px-1.5 font-mono text-[10px] text-ink-secondary">
          {role}
        </span>
        <span className="min-w-0 truncate font-mono text-mono-sm">{doc?.filename ?? missing}</span>
        <span className="grow" />
        {doc ? (
          <>
            <span className="shrink-0 text-micro text-ink-tertiary">
              {doc.format}, {doc.pages} page{doc.pages === 1 ? "" : "s"}
            </span>
            <a
              href={fileHref(doc.objectKey)}
              download={doc.filename}
              className="shrink-0 text-caption text-ink-tertiary underline underline-offset-2 transition-colors duration-150 hover:text-ink"
            >
              Download
            </a>
          </>
        ) : null}
      </div>
      <div className="min-h-0 grow overflow-hidden">
        {doc ? <DocumentBody document={doc} reading={reading} /> : <Note>There is {missing} on this email.</Note>}
      </div>
    </div>
  );
}
