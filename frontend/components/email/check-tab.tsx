"use client";

import { useState } from "react";

import type { EmailTrace } from "@/lib/api/trace-schemas";

import { agreementNote, anythingInDoubt, groupRows } from "./check-groups";
import { checkSentence } from "./field-reading";
import { Folded, Group } from "./field-groups";
import { FieldRow, type FieldRowData } from "./field-row";
import { MessageCard, type Message } from "./message-card";
import { RecommendActionButton } from "./recommend-action-button";
import { Reading, type ReadingFact, Seam } from "./seam";

/**
 * The check: the message, the seam, what Retina made of it in plain English,
 * then the fields that are asking for something.
 *
 * What differs comes first and open; what had nothing to compare comes next;
 * what agreed folds away under a line naming how many. The seven used to be
 * one flat list in the enum's order, which is right for a clerk reading a bill
 * of lading and wrong for a screen, because five rows of `agree` above the one
 * row that differs is five rows of nothing. The enum's order is kept inside
 * each group, so the reading order a clerk knows survives the grouping.
 *
 * A footer carries `Recommend action` where there is one to recommend: this is
 * the tab a reader lands on, so the step after the finding belongs here and
 * not on a second tab they may not open.
 */

interface CheckTabProps {
  trace: EmailTrace;
  message: Message;
}

export function CheckTab({ trace, message }: CheckTabProps) {
  const rows = rowsOf(trace);
  const groups = groupRows(rows);
  const doubt = anythingInDoubt(groups);
  const settled = agreementNote(groups);

  const [open, setOpen] = useState<string | null>(groups.differing[0]?.judgement.field ?? groups.blank[0]?.judgement.field ?? null);
  const [showAgreed, setShowAgreed] = useState(false);
  const toggle = (field: string) => setOpen(open === field ? null : field);
  const draw = (row: FieldRowData) => (
    <FieldRow key={row.judgement.field} row={row} open={open === row.judgement.field} onToggle={() => toggle(row.judgement.field)} />
  );

  return (
    <div className="flex min-h-0 grow flex-col">
      <div className="min-h-0 grow overflow-y-auto px-6 pb-4">
        <div className="pt-4">
          <MessageCard message={message} documents={trace.documents} />
        </div>
        <Seam />
        <Reading facts={factsOf(trace)}>{readingOf(trace)}</Reading>

        {rows.length === 0 ? (
          <p className="max-w-[68ch] py-3 text-small text-ink-tertiary">
            Nothing has been compared yet. A pair is judged once both documents have been read.
          </p>
        ) : (
          <>
            {groups.differing.length > 0 ? (
              <Group title="What differs" count={groups.differing.length} tone="differ">
                {groups.differing.map(draw)}
              </Group>
            ) : null}

            {groups.blank.length > 0 ? (
              <Group title="Nothing to compare" count={groups.blank.length} tone="review">
                {groups.blank.map(draw)}
              </Group>
            ) : null}

            {settled ? <p className="max-w-[68ch] pt-3 text-body text-ink-secondary">{settled}</p> : null}

            {groups.agreed.length > 0 ? (
              <Folded
                open={showAgreed}
                onToggle={() => setShowAgreed((was) => !was)}
                label={doubt ? `The other ${groups.agreed.length} agree` : `Show the ${groups.agreed.length} fields`}
              >
                {groups.agreed.map(draw)}
              </Folded>
            ) : null}
          </>
        )}
      </div>

      {groups.differing.length > 0 ? (
        <footer className="flex shrink-0 items-center gap-2.5 border-t border-hairline bg-surface px-6 py-3">
          <p className="min-w-0 grow truncate text-small text-ink-tertiary">
            {groups.differing.length} field{groups.differing.length === 1 ? "" : "s"} {groups.differing.length === 1 ? "differs" : "differ"}.
          </p>
          <RecommendActionButton emailId={trace.emailId} differing={groups.differing.map((row) => row.judgement.field)} />
        </footer>
      ) : null}
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
