"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icons";
import type { DocumentView, EmailTrace } from "@/lib/api/trace-schemas";

import { DocumentSheet } from "./document-sheet";
import { claimedRoleLabel, docTypeLabel, wrongDocuments } from "./report-eligible";

/**
 * The report when the check stopped on document type: what each file claimed to
 * be, what the model read it as, and why that was enough to hand it over.
 */

const GRID = "grid grid-cols-[minmax(0,1.2fr)_88px_minmax(0,1fr)_minmax(0,1fr)_72px]";

interface WrongDocumentReportProps {
  trace: EmailTrace;
}

export function WrongDocumentReport({ trace }: WrongDocumentReportProps) {
  const flagged = wrongDocuments(trace);
  const [previewing, setPreviewing] = useState<DocumentView | null>(null);
  const [selected, setSelected] = useState(flagged[0]?.filename ?? null);
  const chosen = trace.documents.find((document) => document.filename === selected) ?? flagged[0];

  return (
    <div className="flex min-h-0 grow flex-col">
      <WrongDocumentVerdict document={chosen} />

      <div className={`${GRID} h-11 shrink-0 items-stretch border-b border-hairline bg-surface`}>
        <span className="flex items-center border-r border-hairline px-3 text-caption text-ink-tertiary">File</span>
        <span className="flex items-center border-r border-hairline px-3 text-caption text-ink-tertiary">Claimed</span>
        <span className="flex items-center border-r border-hairline px-3 text-caption text-ink-tertiary">Read as</span>
        <span className="flex items-center border-r border-hairline px-3 text-caption text-ink-tertiary">Why</span>
        <span className="flex items-center px-3 text-caption text-ink-tertiary">File</span>
      </div>

      <div className="min-h-0 grow overflow-y-auto">
        {trace.documents.length === 0 ? (
          <p className="px-3 py-4 text-small text-ink-tertiary">No attachment reached the parser.</p>
        ) : (
          trace.documents.map((document) => (
            <Row
              key={document.filename}
              document={document}
              selected={document.filename === selected}
              onSelect={setSelected}
              onPreview={setPreviewing}
            />
          ))
        )}
      </div>

      {previewing ? <DocumentSheet document={previewing} onClose={() => setPreviewing(null)} /> : null}
    </div>
  );
}

function WrongDocumentVerdict({ document: doc }: { document: DocumentView | undefined }) {
  if (!doc) {
    return (
      <section className="shrink-0 border-b border-hairline bg-surface px-4 py-3">
        <p className="text-small text-ink-tertiary">Select a file below to see what Retina made of it.</p>
      </section>
    );
  }

  const wrong = doc.typeVerdict === "wrong_type";
  return (
    <section className="shrink-0 border-b border-hairline bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex h-[22px] shrink-0 items-center rounded-sm px-2 text-caption font-medium ${wrong ? "bg-review-tint text-review" : "bg-match-tint text-match"}`}>
          {wrong ? "Wrong document" : "Accepted"}
        </span>
        <h2 className="min-w-0 truncate text-strong font-medium text-ink">{doc.filename}</h2>
        {doc.docTypeConfidence === null ? null : (
          <span className="shrink-0 text-caption text-ink-tertiary">{Math.round(doc.docTypeConfidence * 100)}% confidence</span>
        )}
      </div>
      <p className="mt-2 max-w-[92ch] text-strong leading-5 text-ink">
        {wrong
          ? `Named as ${claimedRoleLabel(doc.role).toLowerCase()}, read as ${docTypeLabel(doc.docType)}. ${doc.docTypeRationale ?? "No explanation was recorded."}`
          : `Read as ${docTypeLabel(doc.docType)} and accepted for its place in the pair.`}
      </p>
    </section>
  );
}

function Row({
  document: doc,
  selected,
  onSelect,
  onPreview,
}: {
  document: DocumentView;
  selected: boolean;
  onSelect: (filename: string) => void;
  onPreview: (document: DocumentView) => void;
}) {
  const wrong = doc.typeVerdict === "wrong_type";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(doc.filename)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(doc.filename);
        }
      }}
      className={`${GRID} w-full cursor-pointer items-start border-b border-hairline-faint text-left transition-colors duration-150 hover:bg-sunken ${
        selected ? "bg-[#FFFBF0]" : ""
      }`}
    >
      <span className={`min-w-0 border-r border-hairline px-3 py-2 ${selected ? "shadow-[inset_2px_0_0_0_var(--ink)]" : ""}`}>
        <span className={`block truncate font-mono text-mono-sm ${wrong ? "text-review" : "text-ink"}`}>{doc.filename}</span>
        <span className="mt-0.5 block text-caption text-ink-tertiary">{doc.format}, {doc.pages} page{doc.pages === 1 ? "" : "s"}</span>
      </span>
      <span className="border-r border-hairline px-3 py-2 text-caption font-medium text-ink-secondary">{doc.role}</span>
      <span className={`border-r border-hairline px-3 py-2 text-small ${wrong ? "text-review" : "text-ink-secondary"}`}>
        {docTypeLabel(doc.docType)}
      </span>
      <span className="border-r border-hairline px-3 py-2 text-caption leading-5 text-ink-tertiary">
        {doc.docTypeRationale ?? (wrong ? "Not the document this place expects." : "Accepted for this place.")}
      </span>
      <span className="px-2 py-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onPreview(doc);
          }}
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-accent-line bg-accent-tint px-2 text-caption font-medium text-accent"
        >
          <Icon name="eye" size={12} />
          View
        </button>
      </span>
    </div>
  );
}
