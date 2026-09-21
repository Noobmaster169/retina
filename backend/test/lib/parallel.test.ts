import { describe, expect, it } from "vitest";

import { inParallel, mutex } from "../../src/lib/parallel";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe("inParallel", () => {
  it("returns results in the order of the items, whatever order they finished in", async () => {
    const out = await inParallel([30, 5, 15], 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(out).toEqual([30, 5, 15]);
  });

  it("never has more than the limit in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    await inParallel(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
      peak = Math.max(peak, ++inFlight);
      await tick();
      inFlight--;
    });
    expect(peak).toBe(4);
  });

  it("stops starting items once one has failed", async () => {
    const started: number[] = [];
    await expect(
      inParallel([1, 2, 3, 4, 5, 6], 2, async (n) => {
        started.push(n);
        await tick();
        if (n === 2) throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(started.length).toBeLessThan(6);
  });

  it("handles no items", async () => {
    await expect(inParallel([], 4, async () => 1)).resolves.toEqual([]);
  });
});

describe("mutex", () => {
  it("runs callers one at a time, in the order they asked", async () => {
    const run = mutex();
    const log: string[] = [];
    const job = (name: string) =>
      run(async () => {
        log.push(`${name} in`);
        await tick();
        log.push(`${name} out`);
      });
    await Promise.all([job("a"), job("b"), job("c")]);
    expect(log).toEqual(["a in", "a out", "b in", "b out", "c in", "c out"]);
  });

  it("lets the next caller in after one throws", async () => {
    const run = mutex();
    await expect(run(async () => Promise.reject(new Error("no")))).rejects.toThrow("no");
    await expect(run(async () => "still works")).resolves.toBe("still works");
  });
});
