import { Queue } from "bullmq";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { getPool } from "../../src/db";
import { MemoryPriorityCache } from "../../src/queues/__fakes__/memory.priority-cache";
import { closeRedis, getRedis } from "../../src/queues/connection";
import { HEARTBEAT_KEY, lastBeat } from "../../src/queues/heartbeat";
import { QUEUES } from "../../src/queues/names";
import { type RunningSchedulers, SCHEDULED, startSchedulers } from "../../src/queues/schedulers";

/**
 * Against a real Redis, because the thing worth proving is that a restart
 * upserts the same three schedulers rather than adding a fourth. The box
 * restarts the worker every three minutes when a deploy lands, so a
 * registration that accumulated would be three hundred aging passes a day
 * within a week.
 */

let running: RunningSchedulers | undefined;
let queue: Queue;

async function start(): Promise<RunningSchedulers> {
  return startSchedulers({ pool: getPool(), redis: getRedis(), priority: new MemoryPriorityCache() });
}

beforeEach(async () => {
  queue = new Queue(QUEUES.scheduler, { connection: getRedis() });
  await queue.obliterate({ force: true });
  await getRedis().del(HEARTBEAT_KEY);
});

afterEach(async () => {
  await running?.stop();
  running = undefined;
});

afterAll(async () => {
  await queue.obliterate({ force: true });
  await queue.close();
  await closeRedis();
});

describe("startSchedulers", () => {
  it("registers one repeatable job per task", async () => {
    running = await start();

    const registered = (await queue.getJobSchedulers()).map((one) => one.key).sort();
    expect(registered).toEqual([...Object.values(SCHEDULED)].sort());
  });

  it("registering twice leaves one of each, because a deploy restarts the worker", async () => {
    running = await start();
    await running.stop();
    running = await start();

    expect(await queue.getJobSchedulers()).toHaveLength(Object.values(SCHEDULED).length);
  });

  it("writes the first heartbeat at boot, not one cycle later", async () => {
    const before = Date.now();

    running = await start();

    const beat = await lastBeat(getRedis());
    expect(beat).not.toBeNull();
    expect(Date.parse(beat as string)).toBeGreaterThanOrEqual(before - 1000);
  });

  it("fills the priority cache at boot, so the first email of a run is queued at its client's tier", async () => {
    const priority = new MemoryPriorityCache();
    running = await startSchedulers({ pool: getPool(), redis: getRedis(), priority });

    // The seed migration put the organisers' own domains in core.clients.
    expect(await priority.tierOf("aprilasia.com")).toBe(3);
  });
});
