import { readFile } from "node:fs/promises";

import { z } from "zod";

import { config } from "../config";
import { TruthRow } from "../contracts";
import { RetryableError, TerminalError, UpstreamError } from "../lib/errors";
import type { Truth } from "./score";

/**
 * Where the answer key comes from. A dev machine reads it off disk. On the box
 * the file is mounted into the inbox container and nowhere else, so the only
 * way to it is the organisers' own judge endpoint, over the private compose
 * network. Callers see neither: `loadGroundTruth` answers a Truth or throws.
 */
export type TruthSource = { kind: "file"; path: string } | { kind: "http"; url: string; token: string | undefined };

const TIMEOUT_MS = 30_000;

/** Pure: which source this environment names, or null where it names none. The path wins, so a dev machine never calls out. */
export function pickSource(env: {
  EVAL_GROUND_TRUTH_PATH?: string;
  EVAL_GROUND_TRUTH_URL?: string;
  EVAL_JUDGE_TOKEN?: string;
}): TruthSource | null {
  if (env.EVAL_GROUND_TRUTH_PATH) return { kind: "file", path: env.EVAL_GROUND_TRUTH_PATH };
  if (env.EVAL_GROUND_TRUTH_URL) return { kind: "http", url: env.EVAL_GROUND_TRUTH_URL, token: env.EVAL_JUDGE_TOKEN };
  return null;
}

export function hasGroundTruth(): boolean {
  return pickSource(config) !== null;
}

/** The answer key. Only eval/ may call this; the pipeline never sees a label. */
export async function loadGroundTruth(): Promise<Truth> {
  const source = pickSource(config);
  if (!source) {
    throw new TerminalError("neither EVAL_GROUND_TRUTH_PATH nor EVAL_GROUND_TRUTH_URL is set: this backend holds no answer key");
  }
  const [label, body] = source.kind === "file" ? [source.path, await read(source.path)] : [source.url, await get(source)];
  const parsed = z.record(z.string(), TruthRow).safeParse(body);
  if (!parsed.success) throw new TerminalError(`${label} is not a ground truth file`, { cause: parsed.error });
  return parsed.data;
}

async function read(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

/**
 * `GET /ground_truth` on the inbox server, which answers only where the
 * organisers' own REVEAL_GT is on. Every refusal it has is permanent: 404 is
 * the endpoint disabled, 403 a wrong judge token, 503 the file not mounted.
 * None of those is worth another attempt, so none is marked retryable.
 */
async function get(source: { url: string; token: string | undefined }): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(source.url, {
      headers: source.token ? { "x-judge-token": source.token } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    throw new RetryableError("the answer key server is unreachable", { cause });
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new UpstreamError(502, `the answer key server answered ${response.status}: ${detail}`, { retryable: false });
  }
  return response.json();
}
