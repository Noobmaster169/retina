import type { ReactNode } from "react";

/**
 * Every tinted label in the product. A chip carries its state in its label and
 * its tint: docs/05-design.md section 2.1 principle 9 forbids a status dot
 * beside one, and this file is the reason there is nowhere to put it.
 */

export type Tone = "neutral" | "match" | "differ" | "review" | "fault" | "signal";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-secondary",
  match: "bg-match-tint text-match",
  differ: "bg-differ-tint text-differ",
  review: "bg-review-tint text-review",
  fault: "bg-fault-tint text-fault",
  signal: "bg-signal-tint text-signal",
};

/**
 * Which hue an organiser enum carries. The five categories are deliberately
 * absent: section 4.9 keeps a category neutral, because 520 emails coloured
 * five ways is a rainbow and it spends the hues status needs.
 */
export function toneOf(value: string | null | undefined): Tone {
  if (value === "OK") return "match";
  if (value === "MISMATCH") return "differ";
  if (value === "NEEDS_REVIEW") return "review";
  if (value === "failed") return "fault";
  if (value === "wrong_doc_type" || value === "missing_attachment") return "review";
  if (value === "unreadable" || value === "missing_value") return "review";
  return "neutral";
}

interface ChipProps {
  children: ReactNode;
  tone?: Tone;
  /** An organiser enum, set in mono verbatim. Plain English sits outside the chip, never inside it. */
  mono?: boolean;
  className?: string;
}

export function Chip({ children, tone = "neutral", mono = false, className = "" }: ChipProps) {
  const type = mono ? "font-mono text-mono-xs" : "text-caption font-medium";
  return (
    <span
      className={`inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-sm px-2 ${TONES[tone]} ${type} ${className}`}
    >
      {children}
    </span>
  );
}

/** The enum chip: the organisers' value verbatim, in mono, at the size a status badge takes. */
export function EnumChip({ value, tone, className = "" }: { value: string; tone?: Tone; className?: string }) {
  return (
    <Chip tone={tone ?? toneOf(value)} mono className={`h-[26px] rounded-md px-2.5 text-micro ${className}`}>
      {value}
    </Chip>
  );
}

/** A label above its value: sentence case, tertiary ink, never uppercase. Section 5.1. */
export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`text-caption text-ink-tertiary ${className}`}>{children}</div>;
}

/** A fact stated as a key and a value: "sure 0.93". Used under the seam and nowhere a table would do. */
export function Fact({ label, value, tone = "neutral" }: { label: string; value: string; tone?: Tone }) {
  const ink: Record<Tone, string> = {
    neutral: "text-ink-secondary",
    match: "text-match",
    differ: "text-differ",
    review: "text-review",
    fault: "text-fault",
    signal: "text-signal",
  };
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-sm border border-hairline bg-canvas px-2 text-caption text-ink-secondary">
      {label}
      <span className={`font-mono text-mono-xs ${ink[tone]}`}>{value}</span>
    </span>
  );
}
