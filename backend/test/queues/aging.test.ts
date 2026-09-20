import { Queue } from "bullmq";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { AGE_AFTER_MS, AGE_STEP, ageWaitingJobs } from "../../src/queues/aging";
import { closeRedis, getRedis } from "../../src/queues/connection";

/**
 * Against a real Redis, because the whole question is whether BullMQ's
 * `changePriority` does what the design assumes on the installed version, and
 * a fake queue would only assert that this file calls a method.
 *
 * Time passes by moving the reading clock forward rather than the jobs back: a
 * job's timestamp lives in Redis, and setting it on the local object changes
 * nothing that `getJobs` will read back.
 */

const QUEUE = "test-aging";

/** A moment far enough ahead that everything already in the queue counts as having waited. */
const LATER = () => Date.now() + AGE_AFTER_MS + 1000;

let queue: Queue;

beforeEach(async () => {
  queue = new Queue(QUEUE, { connection: getRedis() });
  await queue.obliterate({ force: true });
});

afterAll(async () => {
  await queue.obliterate({ force: true });
  await queue.close();
  await closeRedis();
});

const waiting = (id: string, priority: number) => queue.add("email", { id }, { jobId: id, priority });

const priorityOf = async (id: string) => (await queue.getJob(id))?.priority;

describe("ageWaitingJobs", () => {
  it("promotes a job that has waited longer than the threshold", async () => {
    await waiting("old", 1000);

    const result = await ageWaitingJobs(queue, LATER());

    expect(result.promoted).toBe(1);
    expect(await priorityOf("old")).toBe(1000 - AGE_STEP);
  });

  it("leaves a job that has not waited long enough alone", async () => {
    await waiting("fresh", 1000);

    expect((await ageWaitingJobs(queue, Date.now())).promoted).toBe(0);
    expect(await priorityOf("fresh")).toBe(1000);
  });

  it("stops at 1, never at 0, which BullMQ reads as no priority at all", async () => {
    await waiting("nearly", 50);

    await ageWaitingJobs(queue, LATER());

    expect(await priorityOf("nearly")).toBe(1);
  });

  it("leaves a job already at the front where it is", async () => {
    await waiting("first", 1);

    expect((await ageWaitingJobs(queue, LATER())).promoted).toBe(0);
  });

  it("puts an aged job ahead of a fresher one that arrived more important", async () => {
    await waiting("waited", 600);
    await ageWaitingJobs(queue, LATER());
    // After the pass, so it is genuinely the newcomer: two jobs added in the
    // same millisecond both count as having waited, whatever clock is passed.
    await waiting("arrived", 550);

    // 500 against 550: the one that waited is served first now, which is the
    // whole point. Without this a tier-3 email never finishes during a burst.
    expect(await priorityOf("waited")).toBe(500);
    expect(await priorityOf("arrived")).toBe(550);
  });

  it("promotes a person's rerun like anything else, because aging only ever moves a job forward", async () => {
    await waiting("run__email__r1", 200);

    await ageWaitingJobs(queue, LATER());

    expect(await priorityOf("run__email__r1")).toBe(100);
  });

  it("takes four passes to bring the least urgent email to the front, and then stops", async () => {
    await waiting("last", 1000);

    for (let pass = 0; pass < 12; pass++) await ageWaitingJobs(queue, LATER());

    expect(await priorityOf("last")).toBe(1);
  });
});
