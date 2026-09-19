import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import type { RunSubset } from "../contracts";
import { TerminalError } from "../lib/errors";
import type { Split } from "./split";

/**
 * The committed id lists under `eval/`: the split and the dev sample. Ids
 * only, no labels, which is why the api may read them to start a run while it
 * may never read the answer key they were made from.
 */

const EVAL_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "eval");
const SPLIT_PATH = join(EVAL_DIR, "split.json");
const DEV_SAMPLE_PATH = join(EVAL_DIR, "dev-sample.json");

const SplitFile = z.object({ seed: z.number(), train: z.array(z.string()), holdout: z.array(z.string()) });
const DevSampleFile = z.object({ seed: z.number(), ids: z.array(z.string()).min(1) });

async function readJson<T>(path: string, schema: z.ZodType<T>, what: string): Promise<T> {
  const parsed = schema.safeParse(JSON.parse(await readFile(path, "utf8")));
  if (!parsed.success) throw new TerminalError(`${path} is not ${what}`, { cause: parsed.error });
  return parsed.data;
}

export function splitPath(): string {
  return SPLIT_PATH;
}

export function devSamplePath(): string {
  return DEV_SAMPLE_PATH;
}

export async function loadSplit(): Promise<Split> {
  return readJson(SPLIT_PATH, SplitFile, "a split file");
}

export async function subsetIds(subset: RunSubset): Promise<string[]> {
  if (subset === "holdout") return (await loadSplit()).holdout;
  return (await readJson(DEV_SAMPLE_PATH, DevSampleFile, "a dev sample file")).ids;
}
