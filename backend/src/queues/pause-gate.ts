import { DelayedError, type Job } from "bullmq";

import type { Queryable } from "../db";
import { RunPausedError } from "../lib/errors";
import { childLogger } from "../lib/logger";
import { runs } from "../ontology/repositories";

const log = childLogger({ module: "pause-gate" });

/**
 * How long a job of a paused run waits before asking again.
 *
 * A minute rather than a few seconds, because the resume is the wake signal
 * and this is only its fallback: for a resume this worker never heard about,
 * and for the one job whose status read straddled the resume and parked
 * itself a moment after the wake had passed. Waking sooner bought nothing and
 * cost the run page its composure, because a job that wakes to re-ask leaves
 * the waiting count for as long as the question takes, and a panel full of
 * rows blinking out and back in is how a paused run looked.
 */
export const PAUSED_RECHECK_MS = 60_000;

/** How often the gate asks which of the runs it is holding work for have been paused. */
export const PAUSE_POLL_MS = 1000;

/** What this needs of a BullMQ job: somewhere to put itself until the run is running again. */
export type DelayableJob = Pick<Job, "id" | "moveToDelayed">;

export interface PauseGate {
  /**
   * One job's work, for as long as its run is running.
   *
   * A job that arrives during a pause never starts. A job the pause catches
   * mid-call has that call aborted where it stands: `signal` is passed down to
   * the model client, so the HTTP request is cancelled, the proxy kills the
   * `claude -p` session behind it and the concurrency slot is handed back.
   * Either way the job goes back to `delayed` with its attempts, its priority
   * and its place untouched, and never reaches the caller as a failure.
   */
  guard<T>(job: DelayableJob, token: string | undefined, runId: string, work: (signal: AbortSignal) => Promise<T>): Promise<T>;
  /** Stops the poll. The workers' own shutdown calls it and nothing else should. */
  stop(): void;
}

/**
 * Pausing a run has to stop the queues, not only the ingest loop, and it has
 * to stop them now.
 *
 * The status used to reach ingest alone, so a run paused with four hundred
 * emails already enqueued went on spending model calls until both queues
 * drained. Checking the status before each job fixed the arrivals but not the
 * calls already in flight, and a `claude -p` generation runs for minutes: a
 * pause that leaves twenty of those running is not a pause.
 *
 * So the gate holds an AbortController per job in flight and polls for the
 * runs those jobs belong to. One query a second for every job, not one per
 * job, which is the whole reason the runs are tracked here rather than each
 * job watching for itself.
 *
 * The work a pause abandons is paid for and lost. That is the price of the
 * button meaning what it says, and it is bounded: `classify` reuses a
 * generator answer already in the ledger on its next attempt, so what is lost
 * is the call in flight and nothing behind it.
 */
export function pauseGate(db: Queryable, pollMs: number = PAUSE_POLL_MS): PauseGate {
  const working = new Map<string, Set<AbortController>>();
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  async function sweep(): Promise<void> {
    const ids = [...working.keys()];
    if (ids.length === 0) return;
    let paused: Set<string>;
    try {
      paused = await runs.pausedAmong(db, ids);
    } catch (error) {
      // A database blip must never abandon work that is running perfectly well.
      log.warn({ err: error instanceof Error ? error.message : String(error) }, "could not read which runs are paused");
      return;
    }
    for (const runId of paused) {
      const calls = working.get(runId);
      if (!calls || calls.size === 0) continue;
      log.info({ runId, jobs: calls.size }, "the run was paused, abandoning what it had in flight");
      // Aborting settles the job, which unregisters it, so iterate a copy.
      for (const call of [...calls]) call.abort();
    }
  }

  /** A re-arming timeout rather than an interval: a slow read must not start a second sweep beside the first. */
  function tick(): void {
    timer = setTimeout(() => {
      void sweep().finally(() => {
        if (!stopped) tick();
      });
    }, pollMs);
    // The poll is never a reason for the process to stay up.
    timer.unref();
  }
  tick();

  /** Parks the job and leaves through BullMQ's own door, which spends no attempt. */
  async function park(job: DelayableJob, token: string | undefined, runId: string): Promise<never> {
    log.debug({ runId, jobId: job.id, delayMs: PAUSED_RECHECK_MS }, "the run is paused, parking the job");
    await job.moveToDelayed(Date.now() + PAUSED_RECHECK_MS, token);
    throw new DelayedError();
  }

  return {
    async guard(job, token, runId, work) {
      if ((await runs.status(db, runId)) === "paused") return park(job, token, runId);

      const controller = new AbortController();
      const calls = working.get(runId) ?? new Set<AbortController>();
      calls.add(controller);
      working.set(runId, calls);
      try {
        return await work(controller.signal);
      } catch (error) {
        if (!(error instanceof RunPausedError)) throw error;
        return await park(job, token, runId);
      } finally {
        calls.delete(controller);
        if (calls.size === 0) working.delete(runId);
      }
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
