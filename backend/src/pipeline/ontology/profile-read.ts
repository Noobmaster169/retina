import type { EntityProfile } from "../../contracts";

/**
 * A rendered profile read back into its parts.
 *
 * The inverse of `renderProfile`, and only of that: this reads our own
 * renderer's output, never a model's free text. The model's answer is parsed
 * once, by a zod schema, where it arrives. What is stored is markdown, because
 * markdown is what a person and the chat both read, and the page wants the
 * summary on its own without the headings under it.
 *
 * Pure, and tested by rendering a profile and reading it back.
 */
export interface ReadProfile {
  summary: string | null;
  observed: string | null;
  general: { text: string; confidence: number | null } | null;
  unknowns: string[];
}

const EMPTY: ReadProfile = { summary: null, observed: null, general: null, unknowns: [] };

/** `## What our mail shows` and the three others, by the heading `renderProfile` writes. */
function sections(markdown: string): { heading: string; body: string }[] {
  return markdown
    .split(/\n## /)
    .slice(1)
    .map((block) => {
      const cut = block.indexOf("\n");
      return cut === -1
        ? { heading: block.trim(), body: "" }
        : { heading: block.slice(0, cut).trim(), body: block.slice(cut + 1).trim() };
    });
}

/** The opening block: the name, the kind, then the summary. Everything before the first heading. */
function opening(markdown: string): string | null {
  const head = markdown.split(/\n## /)[0];
  const lines = head.split("\n").slice(2);
  const text = lines.join("\n").trim();
  return text.length > 0 ? text : null;
}

function confidenceOf(heading: string): number | null {
  const found = /confidence ([0-9.]+)/.exec(heading);
  return found ? Number(found[1]) : null;
}

export function readProfile(markdown: string | null): ReadProfile {
  if (markdown === null || markdown.trim() === "") return EMPTY;
  const found = sections(markdown);
  const general = found.find((section) => section.heading.startsWith("General knowledge"));
  const unknowns = found.find((section) => section.heading === "What our mail does not say");
  return {
    summary: opening(markdown),
    observed: found.find((section) => section.heading === "What our mail shows")?.body ?? null,
    general: general ? { text: general.body, confidence: confidenceOf(general.heading) } : null,
    unknowns: unknowns
      ? unknowns.body
          .split("\n")
          .map((line) => line.replace(/^- /, "").trim())
          .filter((line) => line.length > 0)
      : [],
  };
}

/** What the page shows when a thing has been profiled but the profile says nothing yet. */
export function isEmpty(profile: ReadProfile): boolean {
  return profile.summary === null && profile.observed === null;
}

export type { EntityProfile };
