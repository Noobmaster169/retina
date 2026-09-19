import { UnrecoverableError } from "bullmq";
import { describe, expect, it } from "vitest";

import { LlmUnavailableError, RetryableError, TerminalError } from "../../src/lib/errors";
import { isFinalFailure, LLM_OUTAGE_PAUSE_MS, pausingOnOutage } from "../../src/queues/failure-policy";

class RecordingPauser {
  readonly pauses: number[] = [];
  async rateLimit(expireTimeMs: number): Promise<void> {
    this.pauses.push(expireTimeMs);
  }
}

describe("pausingOnOutage", () => {
  it("returns the work's value and pauses nothing when the call succeeds", async () => {
    const queue = new RecordingPauser();
    await expect(pausingOnOutage(queue, async () => "classified")).resolves.toBe("classified");
    expect(queue.pauses).toEqual([]);
  });

  it("pauses the queue and asks BullMQ to requeue the job when the model is unavailable", async () => {
    const queue = new RecordingPauser();
    const work = async () => {
      throw new LlmUnavailableError("proxy answered 503");
    };
    // The job must come back with its attempts untouched, which is what a RateLimitError does.
    await expect(pausingOnOutage(queue, work)).rejects.toThrow("bullmq:rateLimitExceeded");
    expect(queue.pauses).toEqual([LLM_OUTAGE_PAUSE_MS]);
  });

  it.each([
    ["a terminal error", new TerminalError("the model answered outside the schema twice")],
    ["another retryable error", new RetryableError("postgres is restarting")],
  ])("lets %s through without pausing", async (_name, error) => {
    const queue = new RecordingPauser();
    await expect(
      pausingOnOutage(queue, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(queue.pauses).toEqual([]);
  });
});

const job = (attemptsMade: number, attempts?: number) => ({ attemptsMade, opts: { attempts } });

describe("isFinalFailure", () => {
  it.each([
    ["an unrecoverable error on the first attempt", job(1, 3), new UnrecoverableError("bad payload"), true],
    ["a job stalled out of its allowance", job(1, 3), new Error("job stalled more than allowable limit"), true],
    ["an attempt left", job(1, 3), new Error("proxy timed out"), false],
    ["the last attempt spent", job(3, 3), new Error("proxy timed out"), true],
    ["no attempts configured", job(1), new Error("proxy timed out"), true],
  ])("%s", (_name, spent, error, expected) => {
    expect(isFinalFailure(spent, error)).toBe(expected);
  });
});
