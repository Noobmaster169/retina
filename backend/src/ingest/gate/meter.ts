import type { Redis } from "ioredis";

import type { GateScope } from "../../contracts";
import { childLogger } from "../../lib/logger";

const log = childLogger({ module: "gate-meter" });

/**
 * The three token buckets and the three daily counters, charged atomically.
 *
 * One Lua script and one round trip, because this sits on the enqueue path and
 * a gate that costs six round trips to decide whether to spend money is its
 * own kind of cost. Atomic because two emails arriving together must not both
 * read a bucket with room for one.
 *
 * The buckets are charged whether or not the email is admitted. A refused
 * email still cost the ingest work; charging it keeps a flood's bucket empty
 * rather than handing an attacker a free retry at exactly the limit; and it
 * means the numbers `observe` shows are the numbers `enforce` would have seen.
 */

export interface BucketRequest {
  scope: GateScope;
  principal: string;
  /** Units the burst bucket holds when full. */
  burstCapacity: number;
  /** Units it regains per second. */
  refillPerSec: number;
  dailyCap: number;
}

export interface BucketReading {
  scope: GateScope;
  principal: string;
  burstCapacity: number;
  /** What the bucket held before this email was charged. */
  burstRemaining: number;
  /** What the day had spent before this email was charged. */
  dailyUsed: number;
  dailyCap: number;
  refillPerSec: number;
}

export interface GateMeter {
  /**
   * Charges `units` against every bucket and answers what each one read
   * beforehand. Throws where the meter cannot be reached: the caller decides
   * what an unreadable meter means, because that is a policy question.
   */
  charge(requests: BucketRequest[], units: number, nowMs: number, day: string): Promise<BucketReading[]>;
}

const BUCKET_TTL_SECONDS = 24 * 60 * 60;
const DAY_TTL_SECONDS = 48 * 60 * 60;

export const bucketKey = (scope: GateScope, principal: string): string => `gate:b:${scope}:${principal}`;
export const dayKey = (scope: GateScope, principal: string, day: string): string => `gate:d:${scope}:${principal}:${day}`;

/**
 * Per bucket: refill by the time elapsed, report what was there, then charge.
 *
 * It reports before charging rather than after so a refusal can say "15 of 120
 * left and this email costs 16" instead of a number that has already moved.
 * The charge is unconditional and the floor is zero, so a flood drives a
 * bucket to empty and holds it there rather than into a debt that would take
 * days to work off.
 */
const SCRIPT = `
local now = tonumber(ARGV[1])
local units = tonumber(ARGV[2])
local bucketTtl = tonumber(ARGV[3])
local dayTtl = tonumber(ARGV[4])
local out = {}

for i = 1, #KEYS, 2 do
  local bucket = KEYS[i]
  local day = KEYS[i + 1]
  -- KEYS come in pairs, ARGV holds a (capacity, refill) pair per bucket after
  -- its four fixed arguments, so the nth bucket's pair starts at 5 + (i - 1).
  local base = i - 1
  local capacity = tonumber(ARGV[5 + base])
  local refill = tonumber(ARGV[6 + base])

  local state = redis.call('HMGET', bucket, 'tokens', 'ts')
  local tokens = tonumber(state[1])
  local ts = tonumber(state[2])
  if tokens == nil or ts == nil then
    tokens = capacity
    ts = now
  end

  local elapsed = math.max(0, now - ts) / 1000
  tokens = math.min(capacity, tokens + elapsed * refill)

  local used = tonumber(redis.call('GET', day)) or 0

  out[#out + 1] = tostring(tokens)
  out[#out + 1] = tostring(used)

  -- tostring, because a Lua number handed to redis.call is truncated to an
  -- integer and a bucket that lost its fraction on every email would drift.
  redis.call('HSET', bucket, 'tokens', tostring(math.max(0, tokens - units)), 'ts', tostring(now))
  redis.call('EXPIRE', bucket, bucketTtl)
  redis.call('INCRBY', day, units)
  redis.call('EXPIRE', day, dayTtl)
end

return out
`;

export function redisGateMeter(redis: Redis): GateMeter {
  return {
    async charge(requests, units, nowMs, day) {
      const keys = requests.flatMap((request) => [bucketKey(request.scope, request.principal), dayKey(request.scope, request.principal, day)]);
      const args = [
        String(nowMs),
        String(units),
        String(BUCKET_TTL_SECONDS),
        String(DAY_TTL_SECONDS),
        ...requests.flatMap((request) => [String(request.burstCapacity), String(request.refillPerSec)]),
      ];

      const raw = (await redis.eval(SCRIPT, keys.length, ...keys, ...args)) as string[];
      return requests.map((request, index) => ({
        scope: request.scope,
        principal: request.principal,
        burstCapacity: request.burstCapacity,
        burstRemaining: Number(raw[index * 2] ?? 0),
        dailyUsed: Number(raw[index * 2 + 1] ?? 0),
        dailyCap: request.dailyCap,
        refillPerSec: request.refillPerSec,
      }));
    },
  };
}

/** The day a decision belongs to, in UTC, so two boxes in two time zones agree on when a day ends. */
export function dayOf(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Milliseconds until that UTC day ends, for the retry hint on a daily refusal. */
export function msUntilDayEnd(nowMs: number): number {
  const date = new Date(nowMs);
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return end - nowMs;
}

/** What a meter that cannot be reached looks like to the caller, logged once per email and not swallowed. */
export function meterUnavailable(error: unknown, emailId: string): void {
  log.warn({ emailId, err: error instanceof Error ? error.message : String(error) }, "the gate meter is unreadable");
}
