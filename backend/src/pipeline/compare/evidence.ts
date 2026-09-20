import { ComparisonField } from "../../contracts";
import type { ExtractedField, ExtractedFields } from "./fields";

/**
 * Below this, the extractor's own word on a field is not taken without the
 * verifier reading it again. The same bar the classify step uses for its
 * verifier; no holdout run stands behind it for this step yet.
 */
export const EXTRACT_TRUST_FROM = 0.7;

export type EvidenceReason = "no_quote" | "quote_not_found" | "value_not_in_quote";

export interface Evidence {
  ok: boolean;
  reason?: EvidenceReason;
}

export type DoubtReason = EvidenceReason | "low_confidence";

export interface Doubt {
  field: ComparisonField;
  reason: DoubtReason;
}

/** Whitespace collapsed and case folded, so a quote copied with a different spacing still counts. */
function fold(text: string): string {
  return text.replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * Does the text bear one value out: the quoted line must be in the text, and
 * the value inside the quoted line.
 *
 * The rule every step that quotes its evidence is held to, here rather than in
 * the caller so the folding is the same one everywhere. `value` null asks only
 * that the line was found, which is what a placeholder needs.
 */
export function quoteBacks(text: string, quote: string | null, value: string | null): Evidence {
  if (quote === null || quote.trim() === "") return { ok: false, reason: "no_quote" };
  const folded = fold(quote);
  if (!fold(text).includes(folded)) return { ok: false, reason: "quote_not_found" };
  if (value !== null && !folded.includes(fold(value))) return { ok: false, reason: "value_not_in_quote" };
  return { ok: true };
}

/**
 * Does the document text bear the field out. A field the extractor says the
 * document does not carry has nothing to prove and passes; the judge will call
 * it missing.
 */
export function checkEvidence(text: string, field: ExtractedField): Evidence {
  if (field.value === null && field.placeholder === null) return { ok: true };
  return quoteBacks(text, field.source_quote, field.value);
}

/** Every field the verifier should read again: its evidence fails, or the extractor was unsure. */
export function fieldsInDoubt(text: string, fields: ExtractedFields): Doubt[] {
  const doubts: Doubt[] = [];
  for (const field of ComparisonField.options) {
    const evidence = checkEvidence(text, fields[field]);
    if (!evidence.ok && evidence.reason) doubts.push({ field, reason: evidence.reason });
    else if (fields[field].confidence < EXTRACT_TRUST_FROM) doubts.push({ field, reason: "low_confidence" });
  }
  return doubts;
}
