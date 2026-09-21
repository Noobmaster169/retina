import type { GateCostBreakdown } from "../../contracts";

/**
 * What one email is worth to the gate, in units of roughly one model call.
 *
 * Pure arithmetic over an envelope: how many attachments, how many bytes. It
 * never reads the words. Two identical records give the same number on any
 * machine at any time, which is what makes a refusal explainable and a test
 * table possible.
 *
 * Counting emails per minute would miss the attack this exists for. The
 * pipeline's bill is driven by model calls, and model calls are driven by how
 * many documents an email carries, not by how many envelopes arrive.
 */

/** classify, classify-verify, triage. Paid for every email, whatever is attached. */
const UNITS_PER_EMAIL = 3;
/** doc-type, extract, extract-verify, per document. The term that dominates. */
const UNITS_PER_ATTACHMENT = 3;
/** One field judge per organiser field, charged once as soon as there is a pair to compare. */
const UNITS_PER_COMPARISON = 7;
/** Below this an email is ordinary and the size term is zero: a subject, a body and two shipping documents. */
const FREE_BYTES = 262_144;
/** Every 100 KB past that is one more unit. */
const OVERSIZE_BLOCK_BYTES = 102_400;
/**
 * What an attachment is assumed to weigh when the inbox does not say. A source
 * that cannot report a size must still produce a deterministic number, and
 * guessing small would make "do not tell us the size" the cheapest attack.
 */
const UNKNOWN_ATTACHMENT_BYTES = 131_072;

/** Everything the cost depends on, and nothing else. Not the body text: its length only. */
export interface CostInput {
  subject: string;
  body: string;
  attachments: string[];
  /** Byte size per attachment, positionally. A missing or negative entry is the unknown default. */
  attachmentBytes?: (number | null)[];
}

export interface GateCost {
  units: number;
  breakdown: GateCostBreakdown;
}

/**
 * The size term prices bandwidth, object storage and doc-extract CPU, not
 * tokens: the prompts already truncate at CLASSIFY_BODY_CHARS and
 * EXTRACT_TEXT_CHARS, so an enormous body does not become an enormous prompt.
 * It still costs everything that happens before a prompt is built.
 */
function bytesOf(input: CostInput): number {
  const text = Buffer.byteLength(input.subject, "utf8") + Buffer.byteLength(input.body, "utf8");
  const files = input.attachments.reduce((sum, _path, index) => {
    const stated = input.attachmentBytes?.[index];
    const bytes = typeof stated === "number" && Number.isFinite(stated) && stated >= 0 ? stated : UNKNOWN_ATTACHMENT_BYTES;
    return sum + Math.floor(bytes);
  }, 0);
  return text + files;
}

export function costOf(input: CostInput): GateCost {
  const count = input.attachments.length;
  const bytes = bytesOf(input);

  const breakdown: GateCostBreakdown = {
    email: UNITS_PER_EMAIL,
    attachments: UNITS_PER_ATTACHMENT * count,
    comparison: count >= 2 ? UNITS_PER_COMPARISON : 0,
    oversize: Math.floor(Math.max(0, bytes - FREE_BYTES) / OVERSIZE_BLOCK_BYTES),
    bytes,
  };

  return {
    units: breakdown.email + breakdown.attachments + breakdown.comparison + breakdown.oversize,
    breakdown,
  };
}
