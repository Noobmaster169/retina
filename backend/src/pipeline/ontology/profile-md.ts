import type { EntityKind, EntityProfile } from "../../contracts";

/**
 * A profile as Markdown, and as the text a search matches on.
 *
 * Rows and not files: a file per company cannot join to "shipped since
 * January", cannot be fetched one at a time without a directory walk, and is a
 * second source of truth. `pnpm ontology:export` writes these out for a person
 * who wants to read them; nothing reads that folder back.
 *
 * Pure. The same input always renders the same text, so a profile that did not
 * change does not look changed.
 */

export interface RenderedProfile {
  markdown: string;
  /** The canonical name, every spelling, the prose and every attribute value, for `entities.search`. */
  searchText: string;
}

function attributeLines(attributes: Record<string, string | null>): string[] {
  return Object.entries(attributes)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `- ${key}: ${value}`);
}

export function renderProfile(
  kind: EntityKind,
  canonical: string,
  spellings: string[],
  profile: EntityProfile,
  attributes: Record<string, string | null>,
): RenderedProfile {
  const parts = [`# ${canonical}`, `A ${kind}.`, "", profile.summary];

  const facts = attributeLines(attributes);
  if (facts.length > 0) parts.push("", "## What it is", ...facts);

  parts.push("", "## What our mail shows", profile.observed);

  // Labelled, always, and never merged into the observed section. A reader and
  // the chat both have to be able to tell a fact about this mailbox from a
  // claim about the world.
  if (profile.general !== null) {
    const confidence = profile.generalConfidence === null ? "" : ` (confidence ${profile.generalConfidence.toFixed(2)})`;
    parts.push("", `## General knowledge, unverified${confidence}`, profile.general);
  }
  if (profile.unknowns.length > 0) {
    parts.push("", "## What our mail does not say", ...profile.unknowns.map((unknown) => `- ${unknown}`));
  }

  const values = Object.values(attributes).filter((value): value is string => value !== null && value !== "");
  return {
    markdown: parts.join("\n"),
    searchText: [canonical, ...spellings, profile.summary, profile.observed, profile.general ?? "", ...values].join(" \n"),
  };
}
