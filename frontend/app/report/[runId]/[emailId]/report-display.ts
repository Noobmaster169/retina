import type { FieldTally } from "@/components/report/report-figures";
import type { Tone } from "@/components/ui/chip";

export const ROLE_ORDER = ["SI", "BL", "UNKNOWN"];

export function summaryTitle(tally: FieldTally, fallback: string): string {
  if (tally.differ > 0) return `${tally.differ} ${tally.differ === 1 ? "difference" : "differences"} need attention`;
  if (tally.missing > 0) {
    return `${tally.missing} ${tally.missing === 1 ? "field could" : "fields could"} not be compared`;
  }
  if (tally.total > 0) return "The documents are consistent";
  return fallback;
}

export function summaryText(tally: FieldTally, fieldCount: number): string {
  if (fieldCount === 0) return "No document comparison was required for this email.";
  const checked = tally.total - tally.missing;
  const base = `Retina checked ${checked} ${checked === 1 ? "field" : "fields"} across the Shipping Instruction and Bill of Lading.`;
  if (tally.missing === 0) return base;
  return `${base} ${tally.missing} ${tally.missing === 1 ? "field was" : "fields were"} not available in both documents.`;
}

export function statusStyle(tone: Tone): string {
  if (tone === "match") return "border-match-line bg-match-tint text-match";
  if (tone === "differ") return "border-differ-line bg-differ-tint text-differ";
  if (tone === "review") return "border-review-line bg-review-tint text-review";
  if (tone === "fault") return "border-fault-line bg-fault-tint text-fault";
  if (tone === "accent") return "border-accent-line bg-accent-tint text-accent";
  return "border-hairline-strong bg-sunken text-ink-secondary";
}

export function verdict(same: boolean, missing: boolean): string {
  if (missing) return "Not compared";
  return same ? "Matches" : "Different";
}

export function verdictStyle(same: boolean, missing: boolean): string {
  if (missing) return "text-review";
  return same ? "text-match" : "text-differ";
}

export function roleLabel(role: string): string {
  if (role === "SI") return "Shipping instruction";
  if (role === "BL") return "Bill of lading";
  return "Supporting document";
}
