import type { StoredValue } from "@/lib/api/ontology-schemas";
import { formatWhen } from "@/lib/when";

/**
 * The stored values of one record, each with its type badge and who wrote it.
 *
 * The `written by` column is the whole argument of this screen. A reader can
 * see at a glance which values the sender supplied, which a model decided,
 * which code derived from those, and which nothing ever wrote. A table of
 * key and value would be a row; this is a record.
 */

const TONE_INK: Record<NonNullable<StoredValue["tone"]>, string> = {
  differ: "text-differ",
  review: "text-review",
  match: "text-match",
  fault: "text-fault",
};

/** A value that is an identifier or an enum is set in mono, verbatim. A sentence is not. */
function isVerbatim(valueType: StoredValue["valueType"]): boolean {
  return valueType === "pk" || valueType === "enum" || valueType === "list" || valueType === "123" || valueType === "1.0";
}

export function StoredValues({ values }: { values: StoredValue[] }) {
  return (
    <section>
      <header className="flex h-[34px] items-center border-b border-hairline">
        <h2 className="text-caption font-medium text-ink-tertiary">Stored values</h2>
        <span className="grow" />
        <span className="text-caption text-ink-faint">written by</span>
      </header>
      <ul>
        {values.map((value) => (
          <li key={value.key} className="flex h-[34px] items-center gap-3 border-b border-hairline-faint">
            <span className="inline-flex h-4 min-w-[28px] shrink-0 items-center justify-center rounded-xs bg-active px-1.5 font-mono text-[9.5px] font-medium text-ink-tertiary">
              {value.valueType}
            </span>
            <span className="w-[150px] shrink-0 font-mono text-mono-sm text-ink-secondary">{value.key}</span>
            <Value value={value} />
            <span className="w-[120px] shrink-0 truncate text-right text-caption text-ink-faint">{value.writtenBy}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Value({ value }: { value: StoredValue }) {
  if (value.value === null) {
    // Greying it says "not set". Hiding the row would say "we did not look",
    // which is a different and untrue thing.
    return <span className="min-w-0 grow truncate text-strong text-ink-faint">not set</span>;
  }
  const type = isVerbatim(value.valueType) ? "font-mono text-mono-sm" : "text-strong";
  const ink = value.tone ? TONE_INK[value.tone] : "text-ink";
  // A date crosses the wire as an ISO string so two screens cannot disagree
  // about the instant; it is read here, once, in the words a person uses.
  const shown = value.valueType === "date" ? formatWhen(value.value) : value.value;
  return <span className={`min-w-0 grow truncate ${type} ${ink}`}>{shown}</span>;
}
