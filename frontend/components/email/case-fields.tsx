"use client";

import { useState } from "react";

import type { EmailTrace } from "@/lib/api/trace-schemas";

import { anythingInDoubt, groupRows } from "./check-groups";
import { rowsOf } from "./check-tab";
import { Folded, Group } from "./field-groups";
import { FieldRow, type FieldRowData } from "./field-row";

/**
 * The seven fields on a case, so the value that is missing or disputed can be
 * corrected on the row it belongs to, under the quote it was read from. Never
 * a modal: the whole point of correcting here is that the evidence stays in
 * front of the person typing.
 *
 * Absent where the pair was never judged. A case raised before any field was
 * read has nothing to show here, and a row of seven blanks would say the
 * opposite of what happened.
 */

export interface Correcting {
  /** The field whose row is being corrected, or null. The action bar sets it, so the bar can open a row. */
  field: string | null;
  /** True while a correction is being written and its rerun queued. */
  pending: boolean;
  open(field: string): void;
  close(): void;
  record(field: string, side: "SI" | "BL", value: string): void;
}

export function CaseFields({ trace, correcting }: { trace: EmailTrace; correcting?: Correcting }) {
  const rows = rowsOf(trace);
  const groups = groupRows(rows);
  const [chosen, setChosen] = useState<string | null>(groups.blank[0]?.judgement.field ?? groups.differing[0]?.judgement.field ?? null);
  const [showAgreed, setShowAgreed] = useState(false);

  // A row being corrected is the row on screen. The action bar can start a
  // correction from outside this list, and a person typing into something they
  // cannot see is the one thing this must never allow.
  const correctingField = correcting?.field ?? null;
  const expanded = correctingField ?? chosen;

  function toggle(field: string) {
    if (correctingField) correcting?.close();
    setChosen(expanded === field ? null : field);
  }

  // A correction opened from the action bar can land on a field that is folded
  // away, so the fold opens with it rather than swallowing the row a person
  // was just sent to.
  const correctingAgreed = groups.agreed.some((row) => row.judgement.field === correctingField);

  if (rows.length === 0) return null;

  const draw = (row: FieldRowData) => {
    const field = row.judgement.field;
    return (
      <FieldRow
        key={field}
        row={row}
        open={expanded === field}
        onToggle={() => toggle(field)}
        correcting={
          correcting
            ? {
                active: correctingField === field,
                pending: correcting.pending,
                onOpen: () => correcting.open(field),
                onClose: correcting.close,
                onRecord: (side, value) => correcting.record(field, side, value),
              }
            : undefined
        }
      />
    );
  };

  return (
    <section className="pl-3 pt-3.5">
      <div className="flex h-8 items-center">
        <h3 className="text-[14px] font-semibold tracking-[-0.01em]">The fields</h3>
        <span className="ml-2 min-w-0 truncate text-small text-ink-tertiary">
          {correcting ? "Type what the document says and Retina checks the two again" : "As they stood when the case was settled"}
        </span>
      </div>

      {groups.blank.length > 0 ? (
        <Group title="Nothing to compare" count={groups.blank.length} tone="review">
          {groups.blank.map(draw)}
        </Group>
      ) : null}

      {groups.differing.length > 0 ? (
        <Group title="What differs" count={groups.differing.length} tone="differ">
          {groups.differing.map(draw)}
        </Group>
      ) : null}

      {groups.agreed.length > 0 ? (
        <Folded
          open={showAgreed || correctingAgreed}
          onToggle={() => setShowAgreed((was) => !was)}
          label={anythingInDoubt(groups) ? `The other ${groups.agreed.length} agree` : `Show the ${groups.agreed.length} fields`}
        >
          {groups.agreed.map(draw)}
        </Folded>
      ) : null}
    </section>
  );
}

/** The field a correction most likely belongs to: the first one missing or differing, else the first of the seven. */
export function firstCorrectable(trace: EmailTrace): string | null {
  const rows = rowsOf(trace);
  return (rows.find((row) => row.judgement.missing || !row.judgement.same) ?? rows[0])?.judgement.field ?? null;
}
