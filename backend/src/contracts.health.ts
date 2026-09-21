import { z } from "zod";

import { QueueCounts } from "./contracts.queues";

/**
 * What the system says about itself, as `/health` answers it.
 *
 * Re-exported from contracts.ts; mirrored by hand in
 * frontend/lib/api/queues-schemas.ts and, by substring, in the deploy gate at
 * deploy/lib/stack.sh. That last one is not type-checked against anything, so
 * a change here means grepping deploy/ before finishing.
 */

export const CheckStatus = z.enum(["up", "down"]);
export type CheckStatus = z.infer<typeof CheckStatus>;

/**
 * One dependency, and whatever it says about itself beyond being up.
 *
 * The detail is not decoration: `emails` catches a bind mount that came up
 * empty and `models` catches a proxy serving an empty alias table. Both have
 * looked exactly like a working system from the outside at least once.
 *
 * doc-extract has no such detail any more. It used to report the tesseract
 * build a scan would be read with; there is no character recogniser in that
 * image now, so being up is the whole of what it can say about itself.
 */
const check = <T extends z.ZodRawShape>(detail: T) =>
  z.object({ status: CheckStatus, latencyMs: z.number().optional(), ...detail });

export const HealthChecks = z.object({
  postgres: check({}),
  redis: check({}),
  minio: check({}),
  /** The Averis server in emails/. Named for what it is to us, which is where email comes from. */
  inbox: check({ emails: z.number().optional(), scoringAvailable: z.boolean().optional() }),
  docExtract: check({}),
  llmProxy: check({ models: z.number().optional() }),
  /**
   * Not a probe: the worker is another container with no route into it. This
   * is the mark it leaves in Redis every ten seconds, read back. Null when no
   * beat stands, which covers a worker that is down, one that never ran, and a
   * Redis the api cannot read.
   */
  worker: check({ heartbeatAt: z.string().nullable() }),
});
export type HealthChecks = z.infer<typeof HealthChecks>;

export const HealthReport = z.object({
  /**
   * `down` only when the api cannot do its job at all: postgres or redis.
   * Everything else, a stale heartbeat included, is `degraded` and still a
   * 200, because auto-deploy rolls back on a 503 and a worker one cycle late
   * must never be the reason a good image goes away.
   */
  status: z.enum(["ok", "degraded", "down"]),
  checks: HealthChecks,
  /** The commit this image was built from, or "dev" outside one. */
  version: z.string(),
  /** How much work is waiting, so the state of the queues is in the same reading as the state of the services. */
  queues: z.object({ classify: QueueCounts, compare: QueueCounts }).nullable(),
});
export type HealthReport = z.infer<typeof HealthReport>;
