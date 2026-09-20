/**
 * The most distinctive thing the product draws, from docs/05-design.md section
 * 4.5. When two values differ, the difference is marked at the word, on both
 * sides, never by colouring a column.
 *
 * Both sides take the mark. The earlier rule kept the SI neutral so the design
 * never implied which document was right; the canvas marks both, because a
 * person comparing two documents should not have to hunt for the second half
 * of the pair, and the verdict already says "differ" rather than "wrong". That
 * is the version that was reviewed and signed off, and 4.5 is written to it.
 *
 * Every state carries an underline as well as a colour, so the reading
 * survives without hue: solid for the field being read, dashed for another
 * that differs, dotted for one that agreed.
 */

export type MarkState = "marked" | "agreed" | "flagged" | "quiet" | "bare";

const MARKS: Record<MarkState, string> = {
  // The words the judge said differ, on the field being read.
  marked: "bg-differ-tint text-differ border-b border-solid border-differ rounded-[3px] px-[3px] py-px",
  // The judge said these two mean the same thing although they read differently.
  // A verdict hue on an agreement, kept because it is the clearest evidence
  // anywhere that the model judged rather than string-matched.
  agreed: "bg-match-tint text-match border-b border-solid border-match rounded-[3px] px-[3px] py-px",
  // A field that also differs but is not the one being read.
  flagged: "text-differ border-b border-dashed border-differ px-[2px] py-px",
  // Extracted, proved, and unremarkable.
  quiet: "text-ink border-b border-dotted border-hairline-strong px-[2px] py-px",
  bare: "",
};

interface MarkedSpanProps {
  /** The line as it stands in the document. Only `hit` takes the mark, so the line still reads as itself. */
  pre?: string;
  hit: string;
  post?: string;
  state: MarkState;
}

export function MarkedSpan({ pre = "", hit, post = "", state }: MarkedSpanProps) {
  return (
    <>
      {pre}
      <span className={MARKS[state]}>{hit}</span>
      {post}
    </>
  );
}

/**
 * A value that is not there at all: a blank field, a placeholder standing in
 * for one, a page nothing could be read from. Section 4.6 draws it as a hatch
 * rather than a colour, because missing against different is the most
 * consequential confusion in the product and hatching is safe for every form
 * of colour vision deficiency.
 */
export function Hatch({ placeholder }: { placeholder?: string | null }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="hatch inline-block h-[14px] w-[64px] rounded-[3px] align-middle" aria-hidden="true" />
      <span className="text-caption text-ink-tertiary">
        {placeholder ? (
          <>
            nothing to compare, the document reads <span className="font-mono text-mono-xs">{placeholder}</span>
          </>
        ) : (
          "nothing to compare"
        )}
      </span>
    </span>
  );
}

/**
 * The quote a value was read from. It ships with the value, in the same row:
 * section 2.1 principle 5 calls a field without its quote an unfinished
 * component. Never truncated mid quote.
 */
export function EvidenceWell({ quote, tone = "hairline" }: { quote: string; tone?: "hairline" | "review" | "fault" }) {
  const rule = tone === "review" ? "border-review-line" : tone === "fault" ? "border-fault" : "border-hairline";
  return (
    <blockquote className={`border-l-2 pl-2.5 font-mono text-mono-xs text-ink-tertiary ${rule}`}>{quote}</blockquote>
  );
}
