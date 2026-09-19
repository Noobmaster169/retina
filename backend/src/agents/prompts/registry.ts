import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { TerminalError } from "../../lib/errors";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));

const Frontmatter = z.object({
  step: z.string().min(1),
  version: z.string().regex(/^v\d+$/),
  /** A proxy alias. Every step runs sonnet; the env override is for experiments. */
  model: z.string().min(1),
  /** Only for a step with a reason to cap its answer. Without it the client's generous default applies. */
  max_tokens: z.coerce.number().int().positive().optional(),
});

export interface Prompt {
  step: string;
  version: string;
  model: string;
  maxTokens?: number;
  /** The system text, with `{{schema}}` still in place. */
  text: string;
}

/** The file is `---`, `key: value` lines, `---`, then the prompt. Nothing here needs more YAML than that. */
function parsePromptFile(path: string): Prompt {
  const raw = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new TerminalError(`${path} has no frontmatter`);

  const fields = Object.fromEntries(
    match[1]
      .split("\n")
      .filter((line) => line.includes(":"))
      .map((line) => [line.slice(0, line.indexOf(":")).trim(), line.slice(line.indexOf(":") + 1).trim()]),
  );
  const parsed = Frontmatter.safeParse(fields);
  if (!parsed.success) throw new TerminalError(`${path} has bad frontmatter`, { cause: parsed.error });
  const { step, version, model, max_tokens: maxTokens } = parsed.data;
  return { step, version, model, maxTokens, text: match[2].trim() };
}

function versionNumber(version: string): number {
  return Number(version.slice(1));
}

/**
 * The highest version of a step's prompt on disk. `modelOverride` replaces the
 * model the file names. Choosing a version per run comes in phase 4.
 */
export function resolvePrompt(step: string, modelOverride?: string, dir = PROMPTS_DIR): Prompt {
  let files: string[];
  try {
    files = readdirSync(join(dir, step)).filter((name) => /^v\d+\.md$/.test(name));
  } catch (error) {
    throw new TerminalError(`no prompts for step "${step}"`, { cause: error });
  }
  if (files.length === 0) throw new TerminalError(`no prompts for step "${step}"`);

  const latest = files.sort((a, b) => versionNumber(b.slice(0, -3)) - versionNumber(a.slice(0, -3)))[0];
  const prompt = parsePromptFile(join(dir, step, latest));
  if (prompt.step !== step) throw new TerminalError(`${step}/${latest} says it is for step "${prompt.step}"`);
  return modelOverride ? { ...prompt, model: modelOverride } : prompt;
}
