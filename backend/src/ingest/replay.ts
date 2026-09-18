import { TerminalError } from "../lib/errors";
import { childLogger } from "../lib/logger";
import { sleep } from "../lib/time";
import { emailRuns, runs } from "../ontology/repositories";
import { enqueueClassify, type IngestDeps, ingestEmail } from "./ingest-email";

const log = childLogger({ module: "replay" });

/** `interrupted` is the worker shutting down mid-run: the job must come back. */
export type ReplayOutcome = "completed" | "paused" | "cancelled" | "failed" | "created" | "interrupted";

export interface ReplayHooks {
  onProgress?: (fraction: number) => Promise<void>;
  /** True once the worker has been asked to stop. */
  stopping?: () => boolean;
}

/**
 * Feeds a run's emails into the pipeline one at a time at the run's rate.
 * Re-entrant: it skips what the run already holds, so the same function
 * starts a run, resumes a paused one and recovers one a crash cut short.
 */
export async function replayRun(deps: IngestDeps, runId: string, hooks: ReplayHooks = {}): Promise<ReplayOutcome> {
  const run = await runs.get(deps.pool, runId);
  if (!run) throw new TerminalError(`no such run: ${runId}`);

  const all = run.emailIds ?? (await deps.source.listEmailIds());
  const ids = run.emailLimit ? all.slice(0, run.emailLimit) : all;

  const status = await runs.markStarted(deps.pool, runId, ids.length);
  if (status !== "running") return status ?? "cancelled";

  // A crash between the commit and the enqueue leaves a row with no job.
  // Adding the job again is free when it is already there.
  for (const emailId of await emailRuns.emailIdsForRun(deps.pool, runId, "ingested")) {
    await enqueueClassify(deps, runId, emailId);
  }

  const held = new Set(await emailRuns.emailIdsForRun(deps.pool, runId));
  const delayMs = run.ratePerSecond > 0 ? 1000 / run.ratePerSecond : 0;

  for (const emailId of ids) {
    if (held.has(emailId)) continue;
    if (hooks.stopping?.()) return "interrupted";

    const current = await runs.status(deps.pool, runId);
    if (current !== "running") {
      log.info({ runId, status: current, ingested: held.size }, "replay stopped");
      return current ?? "cancelled";
    }

    await ingestEmail(deps, runId, emailId);
    held.add(emailId);
    await hooks.onProgress?.(held.size / ids.length);
    if (delayMs > 0) await sleep(delayMs);
  }

  await runs.setStatus(deps.pool, runId, "completed", ["running"]);
  log.info({ runId, emails: ids.length }, "ingestion complete");
  return "completed";
}
