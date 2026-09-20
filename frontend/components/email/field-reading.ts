import type { MarkState } from "@/components/ui/marked-span";
import type { FieldJudgementView } from "@/lib/api/comparison-schemas";

/**
 * How one judged field reads. Wording and span arithmetic only: the verdict
 * itself is `same`, `missing` and the judge's own rationale, all decided by
 * the model in pipeline/compare and carried here untouched. Nothing in this
 * file compares two values or decides whether they agree.
 */

/**
 * Which of the four marking states of docs/05-design.md section 4.5 this field
 * takes. Both documents get the same state, because the person is comparing
 * two documents and the product never says which one is right.
 */
export function markOf(judgement: FieldJudgementView, selected: boolean): MarkState {
  if (judgement.missing) return "bare";
  if (!judgement.same) return selected ? "marked" : "flagged";
  // The judge called these the same although they read differently. Green on an
  // agreement spends a verdict hue on a non verdict, and it is kept because it
  // is the clearest evidence on the page that a model judged rather than a
  // string matched: NANTONG, CHINA against NANTONG, CHINA (CNNTG).
  const differentText = judgement.siValue !== null && judgement.blValue !== null && judgement.siValue !== judgement.blValue;
  return differentText ? "agreed" : "quiet";
}

/**
 * What a collapsed row carries between its name and its verdict. A field that
 * agreed shows the value itself, because that is what a person checking a
 * draft actually wants off the row; only a field in doubt spends the line on
 * words about it.
 */
export function collapsedLine(judgement: FieldJudgementView): string {
  if (judgement.missing) return "one side has no value to compare";
  if (!judgement.same) return "the two documents name different things";
  return judgement.siValue ?? judgement.blValue ?? "";
}

/** The one line the field rail carries beside a name. Plain English, and never the enum on its own. */
export function verdictWords(judgement: FieldJudgementView): string {
  if (judgement.missing) return "one side has no value to compare";
  if (!judgement.same) return "different things";
  if (judgement.siValue !== null && judgement.blValue !== null && judgement.siValue !== judgement.blValue) {
    return "the same, written two ways";
  }
  return "the same";
}

/**
 * The value located inside the line it was read from, so only the value takes
 * the mark. A quote that does not contain its value (or is absent) degrades to
 * the value alone rather than guessing where it sat.
 */
export function splitQuote(quote: string | null, value: string): { pre: string; hit: string; post: string } {
  if (!quote) return { pre: "", hit: value, post: "" };
  const at = quote.indexOf(value);
  if (at === -1) return { pre: "", hit: value, post: "" };
  return { pre: quote.slice(0, at), hit: value, post: quote.slice(at + value.length) };
}

/**
 * How the whole check reads in one sentence, under the seam. The counts come
 * from the judged fields; which fields differ is the backend's `defectFields`,
 * which this never recomputes.
 */
export function checkSentence(fields: FieldJudgementView[], differing: string[]): string {
  const agreed = fields.filter((field) => field.same && !field.missing).length;
  const missing = fields.filter((field) => field.missing).length;
  if (fields.length === 0) return "Nothing has been judged yet.";
  if (differing.length === 0 && missing === 0) return `All ${fields.length} fields agree.`;

  const parts: string[] = [];
  if (agreed > 0) parts.push(`${agreed} of the ${fields.length} fields agree`);
  if (differing.length > 0) parts.push(`${differing.length} ${differing.length === 1 ? "differs" : "differ"}`);
  if (missing > 0) parts.push(`${missing} had nothing to compare`);
  return `${parts.join(", ")}.`;
}
