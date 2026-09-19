import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { TerminalError } from "../../lib/errors";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));

const Frontmatter = z.object({
  step: z.string().min(1),
  version: z.string().regex(/^v\d+$/),
  /** A proxy alias. Every step runs sonnet; a run or the env may name another for an experiment. */
  model: z.string().min(1),
  /** Only for a step with a reason to cap its answer. Without it the client's generous default applies. */
  max_tokens: z.coerce.number().int().positive().optional(),
});

/** Few-shot examples a prompt version reads, from `examples.<version>.json` beside it. Data the model reads, never a lookup. */
const Examples = z.array(z.object({ category: z.string(), email: z.string() }));

export interface Prompt {
  step: string;
  version: string;
  model: string;
  maxTokens?: number;
  /** The system text, with `{{schema}}` still in place and any `{{examples}}` filled. */
  text: string;
}

function renderExamples(path: string): string {
  const parsed = Examples.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) throw new TerminalError(`${path} is not an examples file`, { cause: parsed.error });
  return parsed.data.map((example) => `<example category="${example.category}">\n${example.email}\n</example>`).join("\n\n");
}

/** The file is `---`, `key: value` lines, `---`, then the prompt. Nothing here needs more YAML than that. */
function parsePromptFile(path: string, examplesPath: string): Prompt {
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

  let text = match[2].trim();
  if (text.includes("{{examples}}")) {
    if (!existsSync(examplesPath)) throw new TerminalError(`${path} reads examples but ${examplesPath} is missing`);
    text = text.replace("{{examples}}", renderExamples(examplesPath));
  }
  return { step, version, model, maxTokens, text };
}

function versionNumber(version: string): number {
  return Number(version.slice(1));
}

/** The highest version of a step's prompt on disk. */
export function latestVersion(step: string, dir = PROMPTS_DIR): string {
  let files: string[];
  try {
    files = readdirSync(join(dir, step)).filter((name) => /^v\d+\.md$/.test(name));
  } catch (error) {
    throw new TerminalError(`no prompts for step "${step}"`, { cause: error });
  }
  if (files.length === 0) throw new TerminalError(`no prompts for step "${step}"`);
  const versions = files.map((name) => name.slice(0, -3));
  return versions.sort((a, b) => versionNumber(b) - versionNumber(a))[0];
}

/** One exact version of a step's prompt. `model` replaces the one the file names. */
export function loadPrompt(step: string, version: string, model?: string, dir = PROMPTS_DIR): Prompt {
  if (!/^v\d+$/.test(version)) throw new TerminalError(`"${version}" is not a prompt version`);
  const path = join(dir, step, `${version}.md`);
  if (!existsSync(path)) throw new TerminalError(`no prompt ${step}/${version}`);
  const prompt = parsePromptFile(path, join(dir, step, `examples.${version}.json`));
  if (prompt.step !== step) throw new TerminalError(`${step}/${version} says it is for step "${prompt.step}"`);
  if (prompt.version !== version) throw new TerminalError(`${step}/${version}.md says it is version "${prompt.version}"`);
  return model ? { ...prompt, model } : prompt;
}
