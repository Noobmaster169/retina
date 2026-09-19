/**
 * Proves the port: the same submissions scored by score.ts and by the
 * organisers' score_cli.py must agree on every number. The noisy submissions
 * are built here, in memory, and reach Python through a temp file. A
 * committed fixture derived from the answer key would be a copy of it.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { config } from "../config";
import { TerminalError } from "../lib/errors";
import { childLogger } from "../lib/logger";
import { loadGroundTruth } from "./ground-truth";
import { prng } from "./prng";
import { CATEGORIES, scoreAll, type ScoredRow, type Submission, type Truth } from "./score";

const run = promisify(execFile);
const log = childLogger({ module: "eval:parity" });
const TOLERANCE = 1e-4;
const FIELDS = ["shipper", "consignee", "notify_party", "port_of_loading", "port_of_discharge", "container_count", "gross_weight_kg"];
const STATUSES = ["OK", "MISMATCH", "NEEDS_REVIEW"] as const;

/** The truth with `noise` of it spoiled: wrong categories, flipped defects, missing emails, a category nobody defined. */
function noisy(truth: Truth, seed: number, noise: number): Submission {
  const random = prng(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const sub: Submission = {};

  for (const [emailId, gold] of Object.entries(truth)) {
    if (random() < noise / 3) continue;
    const row: ScoredRow = {
      category: random() < noise ? (random() < 0.05 ? "OTHER" : pick(CATEGORIES)) : gold.category,
      status: random() < noise ? pick(STATUSES) : gold.status,
      has_defect: random() < noise ? !gold.has_defect : gold.has_defect,
      defect_fields: (random() < noise
        ? FIELDS.filter(() => random() < 0.25)
        : gold.defect_fields) as ScoredRow["defect_fields"],
    };
    if (random() < 0.7) row.decided_by = random() < 0.5 ? "rule" : "llm";
    sub[emailId] = row;
  }
  return sub;
}

async function python(): Promise<string> {
  for (const candidate of ["python3", "python"]) {
    try {
      await run(candidate, ["--version"]);
      return candidate;
    } catch (error) {
      // Not this name on this machine: Windows ships a `python3` stub that only prints a hint.
      log.debug({ candidate, err: error instanceof Error ? error.message : String(error) }, "interpreter not usable");
    }
  }
  throw new TerminalError("no python interpreter found (tried python3, python)");
}

/** Every numeric or null leaf must match; `path` names the first one that does not. */
function differences(ours: unknown, theirs: unknown, path = ""): string[] {
  if (typeof theirs === "number" && typeof ours === "number") {
    return Math.abs(ours - theirs) <= TOLERANCE ? [] : [`${path}: ours ${ours}, theirs ${theirs}`];
  }
  if (theirs === null || ours === null) return ours === theirs ? [] : [`${path}: ours ${String(ours)}, theirs ${String(theirs)}`];
  if (typeof theirs !== "object" || typeof ours !== "object") return [`${path}: different types`];

  const keys = new Set([...Object.keys(ours as object), ...Object.keys(theirs as object)]);
  return [...keys].flatMap((key) =>
    differences((ours as Record<string, unknown>)[key], (theirs as Record<string, unknown>)[key], `${path}/${key}`),
  );
}

const truthPath = config.EVAL_GROUND_TRUTH_PATH;
if (!truthPath) throw new TerminalError("EVAL_GROUND_TRUTH_PATH is not set");
const truth = await loadGroundTruth();
const dataDir = dirname(truthPath);
const scoreCli = join(dataDir, "..", "server", "score_cli.py");
const interpreter = await python();

const cases: [string, Submission][] = [
  ["sample_submission.json", JSON.parse(await readFile(join(dataDir, "sample_submission.json"), "utf8")) as Submission],
  ["empty submission", {}],
  ["the truth itself", truth],
  ...[0.1, 0.3, 0.5, 0.8].map((noise, i): [string, Submission] => [`noise ${noise}`, noisy(truth, 100 + i, noise)]),
];

const scratch = await mkdtemp(join(tmpdir(), "retina-parity-"));
let failed = 0;
try {
  for (const [name, sub] of cases) {
    const file = join(scratch, "submission.json");
    await writeFile(file, JSON.stringify(sub));
    const { stdout } = await run(interpreter, [scoreCli, file, "--ground-truth", truthPath, "--json"], {
      maxBuffer: 16 * 1024 * 1024,
    });
    const ours = scoreAll(truth, sub);
    const found = differences(ours, JSON.parse(stdout));
    if (found.length > 0) failed += 1;
    log.info({ case: name, final: Number(ours.final_score.toFixed(4)), e2e: ours.end_to_end.success, differences: found }, found.length ? "DIFFERS" : "agrees");
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}

if (failed > 0) {
  log.error({ failed, cases: cases.length }, "score.ts and score_cli.py disagree");
  process.exit(1);
}
log.info({ cases: cases.length, interpreter }, "score.ts and score_cli.py agree to four decimals");
