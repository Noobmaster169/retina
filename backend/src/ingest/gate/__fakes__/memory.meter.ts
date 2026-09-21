import type { BucketReading, BucketRequest, GateMeter } from "../meter";

/**
 * The meter without Redis: the same arithmetic in a Map.
 *
 * It exists so a test can drive a bucket to empty in four calls without a
 * container, and so the worker tests can hold the gate still while they check
 * something else. `fail` makes it throw, which is how the meter-unavailable
 * path is exercised.
 */

interface Bucket {
  tokens: number;
  ts: number;
}

export class MemoryGateMeter implements GateMeter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly days = new Map<string, number>();
  /** Set to make every charge throw, as an unreachable Redis does. */
  fail = false;

  async charge(requests: BucketRequest[], units: number, nowMs: number, day: string): Promise<BucketReading[]> {
    if (this.fail) throw new Error("gate meter unavailable");

    return requests.map((request) => {
      const key = `${request.scope}:${request.principal}`;
      const dailyKey = `${key}:${day}`;
      const held = this.buckets.get(key) ?? { tokens: request.burstCapacity, ts: nowMs };

      const elapsed = Math.max(0, nowMs - held.ts) / 1000;
      const tokens = Math.min(request.burstCapacity, held.tokens + elapsed * request.refillPerSec);
      const dailyUsed = this.days.get(dailyKey) ?? 0;

      this.buckets.set(key, { tokens: Math.max(0, tokens - units), ts: nowMs });
      this.days.set(dailyKey, dailyUsed + units);

      return {
        scope: request.scope,
        principal: request.principal,
        burstCapacity: request.burstCapacity,
        burstRemaining: tokens,
        dailyUsed,
        dailyCap: request.dailyCap,
        refillPerSec: request.refillPerSec,
      };
    });
  }

  /** What a bucket now holds, for a test that wants to assert on it rather than on a verdict. */
  peek(scope: string, principal: string): number | null {
    return this.buckets.get(`${scope}:${principal}`)?.tokens ?? null;
  }
}
