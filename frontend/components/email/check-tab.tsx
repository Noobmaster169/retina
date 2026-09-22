"use client";

import { useState } from "react";

import type { EmailTrace } from "@/lib/api/trace-schemas";

import { anythingInDoubt, groupRows } from "./check-groups";
import { Folded, Group } from "./field-groups";
import { FieldRow, type FieldRowData } from "./field-row";
import { MessageActions } from "./message-actions";
import { MessageCard, type Message } from "./message-card";
import { Seam } from "./seam";

/**
 * The check: the message, the seam, what Retina made of it in plain English,
 * then the fields that are asking for something.
 *
 * What differs comes first, every row expanded; what had nothing to compare comes next;
 * what agreed folds away under a line naming how many. The seven used to be
 * one flat list in the enum's order, which is right for a clerk reading a bill
 * of lading and wrong for a screen, because five rows of `agree` above the one
 * row that differs is five rows of nothing. The enum's order is kept inside
 * each group, so the reading order a clerk knows survives the grouping.
 */

interface CheckTabProps {
  trace: EmailTrace;
  message: Message;
}

export function CheckTab({ trace, message }: CheckTabProps) {
  const rows = rowsOf(trace);
  const groups = groupRows(rows);
  const doubt = anythingInDoubt(groups);

  const [open, setOpen] = useState<string | null>(groups.blank[0]?.judgement.field ?? null);
  const [showAgreed, setShowAgreed] = useState(false);
  const toggle = (field: string) => setOpen(open === field ? null : field);
  const drawDiffering = (row: FieldRowData) => (
    <FieldRow key={row.judgement.field} row={row} open onToggle={() => {}} alwaysOpen />
  );
  const draw = (row: FieldRowData) => (
    <FieldRow key={row.judgement.field} row={row} open={open === row.judgement.field} onToggle={() => toggle(row.judgement.field)} />
  );

  return (
    <div className="flex min-h-0 grow flex-col">
      <div className="min-h-0 grow overflow-y-auto px-6 pb-4">
        <div className="pt-4">
          <MessageCard message={message} documents={trace.documents} foldBody={rows.length > 0} actions={<MessageActions trace={trace} />} />
        </div>
        {rows.length > 0 ? (
          <>
            <Seam label="The check" />
            {groups.differing.length > 0 ? (
              <Group title="What differs" count={groups.differing.length} tone="differ">
                <div className="flex flex-col gap-2.5 pt-0.5">{groups.differing.map(drawDiffering)}</div>
              </Group>
            ) : null}

            {groups.blank.length > 0 ? (
              <Group title="Nothing to compare" count={groups.blank.length} tone="review">
                {groups.blank.map(draw)}
              </Group>
            ) : null}

            {groups.agreed.length > 0 && !doubt ? (
              <Folded
                open={showAgreed}
                onToggle={() => setShowAgreed((was) => !was)}
                label={`All ${groups.agreed.length} fields agree`}
              >
                {groups.agreed.map(draw)}
              </Folded>
            ) : null}
          </>
        ) : null}
      </div>
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
