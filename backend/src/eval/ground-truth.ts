import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { config } from "../config";
import { TruthRow } from "../contracts";
import { TerminalError } from "../lib/errors";
import type { Split } from "./split";
import type { Truth } from "./score";

const SPLIT_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "eval", "split.json");

const SplitFile = z.object({ seed: z.number(), train: z.array(z.string()), holdout: z.array(z.string()) });

export function hasGroundTruth(): boolean {
  return config.EVAL_GROUND_TRUTH_PATH !== undefined;
}

/** The answer key. Only eval/ may call this; the pipeline never sees a label. */
export async function loadGroundTruth(): Promise<Truth> {
  const path = config.EVAL_GROUND_TRUTH_PATH;
  if (!path) throw new TerminalError("EVAL_GROUND_TRUTH_PATH is not set: the eval harness runs on a dev machine only");
  const parsed = z.record(z.string(), TruthRow).safeParse(JSON.parse(await readFile(path, "utf8")));
  if (!parsed.success) throw new TerminalError(`${path} is not a ground truth file`, { cause: parsed.error });
  return parsed.data;
}

export function splitPath(): string {
  return SPLIT_PATH;
}

export async function loadSplit(): Promise<Split> {
  const parsed = SplitFile.safeParse(JSON.parse(await readFile(SPLIT_PATH, "utf8")));
  if (!parsed.success) throw new TerminalError(`${SPLIT_PATH} is not a split file`, { cause: parsed.error });
  return parsed.data;
}
