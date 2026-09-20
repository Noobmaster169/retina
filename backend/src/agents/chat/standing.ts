import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TerminalError } from "../../lib/errors";
import { recipes, signature } from "./skills/recipes";
import { skillCards } from "./skills/registry";

/**
 * What every turn is given before the question: CHAT.md, the schema notes, the
 * skill cards and the recipe signatures. Read once; none of it changes while
 * the process runs.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(HERE, name), "utf8").replace(/\r\n/g, "\n");
}

export interface Standing {
  /** CHAT.md's version, stored on the turn beside the skills'. */
  version: number;
  instructions: string;
  schemaDocs: string;
  skillCards: string;
  recipeSignatures: string;
}

let cached: Standing | undefined;

export function standing(): Standing {
  if (cached) return cached;
  const match = read("CHAT.md").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const version = Number(match?.[1].match(/^version:\s*(\d+)\s*$/m)?.[1]);
  if (!match || !Number.isInteger(version)) throw new TerminalError("CHAT.md has no frontmatter with a version");

  cached = {
    version,
    instructions: match[2].trim(),
    schemaDocs: read("schema-docs.md"),
    skillCards: skillCards(),
    recipeSignatures: [...recipes().values()].map((recipe) => `- ${signature(recipe)}`).join("\n"),
  };
  return cached;
}

/** Everything in it, as one text, for the literal guard: what the agent has been shown before any tool ran. */
export function standingText(held = standing()): string {
  return [held.instructions, held.schemaDocs, held.skillCards, held.recipeSignatures].join("\n\n");
}
