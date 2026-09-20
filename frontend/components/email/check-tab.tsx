"use client";

import { useState } from "react";

import type { EmailTrace } from "@/lib/api/trace-schemas";

import { checkSentence } from "./field-reading";
import { FieldRow, type FieldRowData } from "./field-row";
import { type FileSizes, MessageCard, type Message } from "./message-card";
import { Reading, type ReadingFact, Seam } from "./seam";

/**
 * The check: the message, the seam, what Retina made of it in plain English,
 * then the seven fields in the organisers' own order.
 *
 * The order is the enum's, not the judge's and not "differences first". A
 * documentation clerk reads a bill of lading top to bottom and the seven
 * fields are that document's own order; re-sorting them to put the problems
 * up top would make the page faster to skim and harder to check.
 */

interface CheckTabProps {
  trace: EmailTrace;
  message: Message;
  sizes: FileSizes;
}

export function CheckTab({ trace, message, sizes }: CheckTabProps) {
  const comparison = trace.comparison;
  const [open, setOpen] = useState<string | null>(comparison?.defectFields[0] ?? null);
  const rows = rowsOf(trace);

  return (
    <div className="px-6">
      <div className="pt-4">
        <MessageCard message={message} sizes={sizes} />
      </div>
      <Seam />
      <Reading facts={factsOf(trace)}>{readingOf(trace)}</Reading>

      <div className="flex h-8 items-center">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">The check</h2>
        <span className="ml-2 text-small text-ink-tertiary">Seven fields, in the organisers&apos; order</span>
      </div>

      {rows.length === 0 ? (
        <p className="max-w-[68ch] py-3 text-small text-ink-tertiary">
          Nothing has been compared yet. A pair is judged once both documents have been read.
        </p>
      ) : (
        rows.map((row) => (
          <FieldRow
            key={row.judgement.field}
            row={row}
            open={open === row.judgement.field}
            onToggle={() => setOpen(open === row.judgement.field ? null : row.judgement.field)}
          />
        ))
      )}
    </div>
  );
}

/** Each judged field beside what the extractor read from each document, so a row carries its own evidence. */
export function rowsOf(trace: EmailTrace): FieldRowData[] {
  const si = trace.extractions.find((extraction) => extraction.role === "SI");
  const bl = trace.extractions.find((extraction) => extraction.role === "BL");
  return (trace.comparison?.fields ?? []).map((judgement) => ({
    judgement,
    si: si?.fields.find((field) => field.field === judgement.field),
    bl: bl?.fields.find((field) => field.field === judgement.field),
  }));
}

/** What happened, in words, before any enum. Section 2.2: plain English first, the enum inside it. */
function readingOf(trace: EmailTrace): string {
  const opened = trace.documents.length;
  const named = trace.documents.filter((document) => document.typeVerdict === "ok").length;
  const opening =
    opened === 0
      ? "No attachment has been opened yet."
      : `${opened === 2 ? "Both files" : `${opened} file${opened === 1 ? "" : "s"}`} opened and ${
          named === opened ? "were the documents their names claimed" : `${named} of them were the document their name claimed`
        }.`;
  const check = trace.comparison ? checkSentence(trace.comparison.fields, trace.comparison.defectFields) : "";
  return `${opening} ${check}`.trim();
}

/** The facts beside the reading: the enums, verbatim, each inside its own sentence-case label. */
function factsOf(trace: EmailTrace): ReadingFact[] {
  const facts: ReadingFact[] = [];
  const classification = trace.classification;
  if (classification) {
    facts.push({ label: "sorted", value: classification.humanCategory ?? classification.finalCategory });
    facts.push({
      label: "sure",
      value: classification.generator.confidence.toFixed(2),
      tone: classification.generator.confidence >= 0.8 ? "match" : "neutral",
    });
    facts.push({ label: "decided by", value: classification.decidedBy });
  }
  const comparison = trace.comparison;
  if (comparison) {
    facts.push({
      label: "fields that differ",
      value: `${comparison.defectFields.length} of ${comparison.fields.length}`,
      tone: comparison.defectFields.length > 0 ? "differ" : "match",
    });
  }
  return facts;
}
