import { readFile } from "node:fs/promises";

import { z } from "zod";

import { config } from "../config";
import { TruthRow } from "../contracts";
import { TerminalError } from "../lib/errors";
import type { Truth } from "./score";

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
