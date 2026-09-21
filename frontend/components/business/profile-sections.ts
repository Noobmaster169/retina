/**
 * A stored profile, split back into the parts renderProfile wrote. The
 * markdown is the model's, so this reads by heading and never guesses at prose.
 */

export interface ProfileSections {
  summary: string | null;
  observed: string | null;
  general: string | null;
  generalConfidence: string | null;
}

const EMPTY: ProfileSections = { summary: null, observed: null, general: null, generalConfidence: null };

export function sectionsOf(markdown: string | null): ProfileSections {
  if (!markdown) return EMPTY;
  const blocks = markdown.split(/\n(?=## )/);
  const head = blocks[0] ?? "";
  const summary =
    head
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line !== "" && !line.startsWith("#") && !/^A \w+\.$/.test(line)) ?? null;
  const section = (title: RegExp): { body: string | null; heading: string | null } => {
    const block = blocks.find((candidate) => title.test(candidate.split("\n")[0] ?? ""));
    if (!block) return { body: null, heading: null };
    const [heading, ...rest] = block.split("\n");
    return { body: rest.join("\n").trim() || null, heading };
  };
  const observed = section(/^## What our mail shows/).body;
  const general = section(/^## General knowledge/);
  const confidence = general.heading ? (/confidence (\d(?:\.\d+)?)/.exec(general.heading)?.[1] ?? null) : null;
  return { summary, observed, general: general.body, generalConfidence: confidence };
}
