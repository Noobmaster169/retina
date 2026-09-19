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
 * Does the document text bear the field out: the quoted line must be in the
 * text, and the value inside the quoted line. A placeholder needs only its
 * line found. A field the extractor says the document does not carry has
 * nothing to prove and passes; the judge will call it missing.
 */
export function checkEvidence(text: string, field: ExtractedField): Evidence {
  if (field.value === null && field.placeholder === null) return { ok: true };
  if (field.source_quote === null || field.source_quote.trim() === "") return { ok: false, reason: "no_quote" };
  const quote = fold(field.source_quote);
  if (!fold(text).includes(quote)) return { ok: false, reason: "quote_not_found" };
  if (field.value !== null && !quote.includes(fold(field.value))) return { ok: false, reason: "value_not_in_quote" };
  return { ok: true };
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
