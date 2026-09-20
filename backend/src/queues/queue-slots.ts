import type { Queue } from "bullmq";

import type { QueueName, QueueView } from "../contracts";
import { emailIdOfJob, runIdOfJob } from "../lib/ids";

/**
 * Who holds each slot of a queue and who is next for one. The counts are in
 * RunSummary already; this is the part the run page draws as rows, and it
 * exists because a panel of counters cannot say which email has been stuck for
 * forty seconds.
 *
 * Reading and wording are separate on purpose: a queue is read once, then the
 * route resolves every waiting email's attachments in one query rather than
 * one per queue.
 */

/** A job with a priority waits in `prioritized`, not `waiting`. Every email job has one. */
const WAITING = ["waiting", "prioritized", "delayed"] as const;

/** How many waiting jobs the page lists by name. The rest is the count beside them. */
export const NEXT_IN_LINE = 5;

export interface RunJob {
  emailId: string;
  /** BullMQ's own clocks: when the job was added, and when a worker took it. */
  addedAt: number;
  startedAt: number | undefined;
}

export interface QueueReading {
  name: QueueName;
  active: RunJob[];
  /** The oldest waiting jobs, already trimmed to what the page lists. */
  next: RunJob[];
  waiting: number;
  failed: number;
  /** Set when failure-policy.ts rate limited the queue after a dependency refused. */
  heldForMs: number | null;
  /** When that reading was taken, so a view can turn the remaining time into an instant. */
  readAt: number;
}

async function jobsOfRun(queue: Queue, runId: string, types: Parameters<Queue["getJobs"]>[0]): Promise<RunJob[]> {
  const jobs = await queue.getJobs(types);
  return jobs.flatMap((job) => {
    if (job.id === undefined || runIdOfJob(job.id) !== runId) return [];
    const emailId = emailIdOfJob(job.id);
    return emailId ? [{ emailId, addedAt: job.timestamp, startedAt: job.processedOn }] : [];
  });
}

/** One queue, read once: its jobs for this run, its counts, and whether it is held. */
export async function read(queue: Queue, name: QueueName, runId: string): Promise<QueueReading> {
  const [active, waiting, counts, heldFor] = await Promise.all([
    jobsOfRun(queue, runId, ["active"]),
    jobsOfRun(queue, runId, [...WAITING]),
    queue.getJobCounts(),
    queue.getRateLimitTtl(),
  ]);
  return {
    name,
    active: active.sort((a, b) => (a.startedAt ?? a.addedAt) - (b.startedAt ?? b.addedAt)),
    next: waiting.sort((a, b) => a.addedAt - b.addedAt).slice(0, NEXT_IN_LINE),
    waiting: (counts.waiting ?? 0) + (counts.prioritized ?? 0) + (counts.delayed ?? 0),
    failed: counts.failed ?? 0,
    heldForMs: heldFor > 0 ? heldFor : null,
    readAt: Date.now(),
  };
}

/** What a job is doing when no model call of its own is in flight. Never a stage name. */
const AT_REST: Record<QueueName, string> = {
  classify: "reading the email",
  compare: "opening the attachments",
};

export interface Wording {
  /** The step each slot is on, from the live calls. A queue knows which email it holds and nothing about the model. */
  stepOf: (emailId: string) => string | undefined;
  /** How a waiting email's attachments read: "two files, txt and pdf". */
  filesOf: (emailId: string) => string;
}

export function viewOf(reading: QueueReading, concurrency: number, now: number, words: Wording): QueueView {
  return {
    name: reading.name,
    concurrency,
    waiting: reading.waiting,
    active: reading.active.length,
    failed: reading.failed,
    heldUntil: reading.heldForMs === null ? null : new Date(reading.readAt + reading.heldForMs).toISOString(),
    slots: reading.active.map((job) => ({
      emailId: job.emailId,
      step: words.stepOf(job.emailId) ?? AT_REST[reading.name],
      startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : null,
      elapsedMs: job.startedAt ? Math.max(0, now - job.startedAt) : null,
    })),
    next: reading.next.map((job) => ({
      emailId: job.emailId,
      files: words.filesOf(job.emailId),
      queuedAt: new Date(job.addedAt).toISOString(),
    })),
  };
}
