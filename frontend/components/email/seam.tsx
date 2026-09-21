import type { ReactNode } from "react";

import { Fact, type Tone } from "@/components/ui/chip";
import { SeamGlyph } from "@/components/ui/icons";

/**
 * The seam: a labelled rule saying where the sender stops and Retina starts.
 * It was the single most useful change across four rounds of review, on a page
 * that had no obvious problem until someone tried to tell the two apart.
 *
 * The email page is unreadable without it, so it is a component and not a
 * border, and it carries the label rather than leaving it to the caller.
 *
 * The label names what is below instead of explaining the rule. It read
 * "Below this line is Retina, not the sender", which spent a sentence on a
 * boundary the bordered card above already draws, and left the rule itself
 * too short to read as a separator.
 */
export function Seam({ label = "Retina's reading" }: { label?: string }) {
  return (
    <div className="flex h-11 items-center gap-2.5" role="separator" aria-label={label}>
      <SeamGlyph size={14} />
      <span className="shrink-0 text-small font-medium text-ink-secondary">{label}</span>
      <span className="block h-px grow bg-hairline-strong" aria-hidden="true" />
    </div>
  );
}

export interface ReadingFact {
  label: string;
  value: string;
  tone?: Tone;
}

/**
 * What Retina made of the email, in plain English first and the enum inside
 * it. "Five of the seven fields agree, two name different companies", then
 * `BL_COMPARISON` in mono as a fact beside it. Never the other way round:
 * docs/05-design.md section 2.2.
 */
export function Reading({ children, facts }: { children: ReactNode; facts: ReadingFact[] }) {
  return (
    <section className="mb-3 rounded-lg border border-hairline bg-surface px-3.5 py-3">
      <p className="max-w-[68ch] text-strong leading-5 text-ink-secondary">{children}</p>
      {facts.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {facts.map((fact) => (
            <Fact key={fact.label} label={fact.label} value={fact.value} tone={fact.tone} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
