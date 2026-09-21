import { DelayedError } from "bullmq";
import { afterEach, describe, expect, it } from "vitest";

import type { RunStatus } from "../../src/contracts";
import type { Queryable } from "../../src/db";
import { RunPausedError, TerminalError } from "../../src/lib/errors";
import { PAUSED_RECHECK_MS, type PauseGate, pauseGate } from "../../src/queues/pause-gate";

/**
 * The gate answers one question for a job: may this run work right now. Both
 * halves of the answer are here, because they are one behaviour seen at two
 * moments: a job that arrives during a pause, and a job the pause catches
 * mid-call.
 */

/** Stands in for the two reads the gate makes, over a status a test can move under it. */
function database(status: () => RunStatus | null): Queryable {
  return {
    query: async (text: string, values?: unknown[]) => {
      const now = status();
      // `pausedAmong` asks for the ids that are paused; `status` asks for one run's.
      if (text.includes("status = 'paused'")) {
        const ids = (values?.[0] ?? []) as string[];
        return { rows: now === "paused" ? ids.map((id) => ({ id })) : [] };
      }
      return { rows: now === null ? [] : [{ status: now }] };
    },
  } as unknown as Queryable;
}

class RecordingJob {
  readonly id = "run__email_001";
  readonly delays: { until: number; token: string | undefined }[] = [];
  async moveToDelayed(timestamp: number, token?: string): Promise<void> {
    this.delays.push({ until: timestamp, token });
  }
}

/** Resolves once the signal fires, so a test can wait for the sweep rather than sleeping a fixed time. */
function aborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
}

let gate: PauseGate | undefined;
afterEach(() => {
  gate?.stop();
  gate = undefined;
});

describe("pauseGate, a job arriving", () => {
  it.each<[string, RunStatus | null]>([
    ["running", "running"],
    ["completed, which is the ingest's word and not the pipeline's", "completed"],
    ["cancelled, which the processors stop on themselves", "cancelled"],
    ["gone", null],
  ])("runs the work of a %s run", async (_name, status) => {
    gate = pauseGate(database(() => status));
    const job = new RecordingJob();
    await expect(gate.guard(job, "token", "run", async () => "classified")).resolves.toBe("classified");
    expect(job.delays).toEqual([]);
  });

  it("parks a paused run's job in delayed without running it, which spends no attempt", async () => {
    gate = pauseGate(database(() => "paused"));
    const job = new RecordingJob();
    const before = Date.now();
    let ran = false;

    await expect(
      gate.guard(job, "token", "run", async () => {
        ran = true;
      }),
    ).rejects.toBeInstanceOf(DelayedError);

    expect(ran).toBe(false);
    expect(job.delays).toHaveLength(1);
    expect(job.delays[0].token).toBe("token");
    expect(job.delays[0].until).toBeGreaterThanOrEqual(before + PAUSED_RECHECK_MS);
  });

  it("lets a real failure through untouched rather than parking it", async () => {
    gate = pauseGate(database(() => "running"));
    const job = new RecordingJob();
    await expect(
      gate.guard(job, "token", "run", async () => {
        throw new TerminalError("the model answered outside the schema twice");
      }),
    ).rejects.toBeInstanceOf(TerminalError);
    expect(job.delays).toEqual([]);
  });
});

describe("pauseGate, a pause landing mid-call", () => {
  it("aborts the work where it stands and parks the job", async () => {
    let status: RunStatus = "running";
    gate = pauseGate(
      database(() => status),
      5,
    );
    const job = new RecordingJob();

    const guarded = gate.guard(job, "token", "run", async (signal) => {
      status = "paused";
      await aborted(signal);
      // What the model client throws once its request is cancelled.
      throw new RunPausedError("the run was paused during a sonnet call");
    });

    await expect(guarded).rejects.toBeInstanceOf(DelayedError);
    expect(job.delays).toHaveLength(1);
  });

  it("leaves a job of another run alone", async () => {
    const paused = new Set<string>();
    const db = {
      query: async (text: string, values?: unknown[]) => {
        if (text.includes("status = 'paused'")) {
          const ids = (values?.[0] ?? []) as string[];
          return { rows: ids.filter((id) => paused.has(id)).map((id) => ({ id })) };
        }
        return { rows: [{ status: paused.has(String(values?.[0])) ? "paused" : "running" }] };
      },
    } as unknown as Queryable;
    gate = pauseGate(db, 5);

    let otherAborted = false;
    const other = gate.guard(new RecordingJob(), "token", "other-run", async (signal) => {
      signal.addEventListener("abort", () => {
        otherAborted = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 60));
      return "finished";
    });
    const mine = gate.guard(new RecordingJob(), "token", "run", async (signal) => {
      paused.add("run");
      await aborted(signal);
      throw new RunPausedError("the run was paused");
    });

    await expect(mine).rejects.toBeInstanceOf(DelayedError);
    await expect(other).resolves.toBe("finished");
    expect(otherAborted).toBe(false);
  });

  it("stops polling once told to, so a closed worker leaves no timer behind", async () => {
    let status: RunStatus = "running";
    const closing = pauseGate(
      database(() => status),
      5,
    );
    let signalled: AbortSignal | undefined;
    const held = closing.guard(new RecordingJob(), "token", "run", async (signal) => {
      signalled = signal;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return "finished";
    });
    closing.stop();
    status = "paused";

    await expect(held).resolves.toBe("finished");
    expect(signalled?.aborted).toBe(false);
  });
});
