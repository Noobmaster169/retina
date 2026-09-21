import type { FieldRowData } from "./field-row";

/**
 * The seven fields split by what a person has to do about them.
 *
 * The enum's order is kept inside every group, because a documentation clerk
 * reads a bill of lading top to bottom and the seven are that document's own
 * order. What changes is that the fields nobody needs to look at stop taking
 * up the space of the ones they do: five rows of `agree` above the one that
 * differs is five rows of nothing.
 *
 * The agreeing fields are folded away and never dropped. A field both
 * documents wrote differently and the judge still called the same is the
 * clearest evidence on the page that a model judged rather than a string
 * matched, and `agreementNote` is there so an all-agreeing check still says so
 * in one line instead of seven rows.
 */

export interface CheckGroups {
  /** Both documents name different things. */
  differing: FieldRowData[];
  /** One side had no value, which is an uncertainty and never a difference. */
  blank: FieldRowData[];
  /** Judged the same, whether or not the two documents spelled it the same way. */
  agreed: FieldRowData[];
}

export function groupRows(rows: FieldRowData[]): CheckGroups {
  return {
    differing: rows.filter((row) => !row.judgement.same && !row.judgement.missing),
    blank: rows.filter((row) => row.judgement.missing),
    agreed: rows.filter((row) => row.judgement.same && !row.judgement.missing),
  };
}

/** Whether anything on this check is asking for a person. */
export function anythingInDoubt(groups: CheckGroups): boolean {
  return groups.differing.length > 0 || groups.blank.length > 0;
}

/**
 * The fields both documents wrote differently and the judge called the same
 * anyway. Named, because this is the sentence that proves the check was a
 * judgement: `NANTONG, CHINA` against `NANTONG, CHINA (CNNTG)`.
 */
export function rewordedIn(groups: CheckGroups): string[] {
  return groups.agreed
    .filter((row) => row.judgement.siValue !== null && row.judgement.blValue !== null && row.judgement.siValue !== row.judgement.blValue)
    .map((row) => row.judgement.field);
}

/** One line in place of seven rows, for a check where everything agreed. Null when something is in doubt. */
export function agreementNote(groups: CheckGroups): string | null {
  if (anythingInDoubt(groups)) return null;
  const total = groups.agreed.length;
  if (total === 0) return null;
  const all = total === 1 ? "The one field compared agrees" : `All ${total} fields agree`;
  const reworded = rewordedIn(groups);
  if (reworded.length === 0) return `${all} across the two documents.`;
  const was = reworded.length === 1 ? "was" : "were";
  const them = reworded.length === 1 ? "it" : "them";
  return `${all}. ${sentence(list(reworded))} ${was} written two ways and the judge called ${them} the same.`;
}

function list(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

function sentence(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
