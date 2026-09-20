import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { TerminalError } from "../../../lib/errors";
import { recipes, signature, type Recipe } from "./recipes";

/**
 * How to do one kind of task in this database, written once.
 *
 * A skill is a prompt file: `skills/<name>/SKILL.md`, with a version in its
 * frontmatter that is stored on every turn that used it. Its card (when to
 * reach for it, and the recipes it brings) is always in front of the agent; its
 * body is injected by the harness on an event, or asked for with `load_skill`.
 *
 * Skills say how this schema stores things. They name no company, port,
 * sender or subject code: what exists is the orientation's to report, from the
 * database, so a fresh seed needs no edit here.
 */

const SKILLS_DIR = dirname(fileURLToPath(import.meta.url));

const Frontmatter = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.coerce.number().int().positive(),
  when: z.string().min(10).max(240),
});

export interface Skill {
  name: string;
  version: number;
  /** One sentence: the situation in which this skill is the right one. */
  when: string;
  body: string;
  recipes: Recipe[];
}

export function parseSkill(raw: string, folder: string, path: string, all: Map<string, Recipe>): Skill {
  const text = raw.replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new TerminalError(`${path} has no frontmatter`);
  const fields = Object.fromEntries(
    match[1]
      .split("\n")
      .filter((line) => line.includes(":"))
      .map((line) => [line.slice(0, line.indexOf(":")).trim(), line.slice(line.indexOf(":") + 1).trim()]),
  );
  const parsed = Frontmatter.safeParse(fields);
  if (!parsed.success) throw new TerminalError(`${path} has bad frontmatter`, { cause: parsed.error });
  if (parsed.data.name !== folder) throw new TerminalError(`${path} says it is "${parsed.data.name}"`);

  const body = match[2].trim();
  const own = [...all.values()].filter((recipe) => recipe.skill === folder);
  // A skill that tells the agent to call a recipe which does not exist costs a step every time it is followed.
  // Skills write a recipe as `name(...)`, which is what tells one from a SQL function such as `count(`.
  for (const called of body.matchAll(/`([a-z][a-z0-9_]*)\(\.\.\.\)`/g)) {
    if (!all.has(called[1])) throw new TerminalError(`${path} names a recipe "${called[1]}" that does not exist`);
  }
  return { ...parsed.data, body, recipes: own };
}

export function loadSkills(dir = SKILLS_DIR, all = recipes()): Map<string, Skill> {
  const skills = new Map<string, Skill>();
  for (const entry of readdirSync(dir, { withFileTypes: true }).filter((item) => item.isDirectory())) {
    const path = join(dir, entry.name, "SKILL.md");
    if (!existsSync(path)) continue;
    skills.set(entry.name, parseSkill(readFileSync(path, "utf8"), entry.name, path, all));
  }
  return skills;
}

let cached: Map<string, Skill> | undefined;

export function skills(): Map<string, Skill> {
  cached ??= loadSkills();
  return cached;
}

/** Two lines a skill: when it applies, and what it brings. Always in the prompt. */
export function skillCards(all = skills()): string {
  return [...all.values()]
    .map((skill) => {
      const brings = skill.recipes.length > 0 ? `\n  recipes: ${skill.recipes.map((recipe) => recipe.name).join(", ")}` : "";
      return `- ${skill.name}: ${skill.when}${brings}`;
    })
    .join("\n");
}

/** A skill as the agent reads it: the body, then the full signature of every recipe it brings. */
export function skillText(skill: Skill): string {
  const brings = skill.recipes.map((recipe) => `- ${signature(recipe)}`).join("\n");
  return `## Skill: ${skill.name} (v${skill.version})\n\n${skill.body}${brings ? `\n\nRecipes this skill brings, called with run_recipe:\n${brings}` : ""}`;
}

export function skillVersions(names: string[], all = skills()): { name: string; version: number }[] {
  return names.flatMap((name) => {
    const skill = all.get(name);
    return skill ? [{ name, version: skill.version }] : [];
  });
}
