import { z } from "zod";

/**
 * The admission gate: whether we spend anything on an email before knowing
 * what it is.
 *
 * Re-exported from contracts.ts; mirrored by hand in
 * frontend/lib/api/gate-schemas.ts.
 *
 * None of these values is an organiser enum and none of them reaches a prompt.
 * A verdict here says `admit` or `hold` and never what an email is: the model
 * classifies every admitted email exactly as it did before this existed, and a
 * held email is not a category, it is an email nobody has paid to read yet.
 */

/**
 * `off` skips the gate entirely. `observe` reaches a verdict, charges the
 * buckets and records the row, then admits anyway. `enforce` holds.
 *
 * The default is `observe`, because the only responsible way to deploy a rate
 * limiter is to look at what it would have done to real traffic first.
 */
export const GateMode = z.enum(["off", "observe", "enforce"]);
export type GateMode = z.infer<typeof GateMode>;

/** Which principal a bucket is about. `global` is every sender added together. */
export const GateScope = z.enum(["address", "domain", "global"]);
export type GateScope = z.infer<typeof GateScope>;

/** What a person decided. `auto` is the absence of a decision, not a third one. */
export const GatePolicy = z.enum(["auto", "allow", "block"]);
export type GatePolicy = z.infer<typeof GatePolicy>;

/**
 * What a sender has earned, in order of precedence. Earned by distinct active
 * days and never by volume: you cannot buy standing by sending more, only by
 * having existed over more separate days.
 */
export const GateStanding = z.enum(["blocked", "trusted", "established", "regular", "new", "unknown"]);
export type GateStanding = z.infer<typeof GateStanding>;

/** Two outcomes. There is no third, and in particular there is no "dropped". */
export const GateDecision = z.enum(["admit", "hold"]);
export type GateDecision = z.infer<typeof GateDecision>;

/**
 * Why. `blocked_by_person` is the only reason a human authored, and the only
 * one that bites while the mode is `observe`.
 */
export const GateReason = z.enum([
  "ok",
  "blocked_by_person",
  "burst",
  "daily",
  "budget",
  "meter_unavailable",
]);
export type GateReason = z.infer<typeof GateReason>;

/** What the units were made of, so a row can say why it cost what it cost. */
export const GateCostBreakdown = z.object({
  email: z.number().int(),
  attachments: z.number().int(),
  comparison: z.number().int(),
  oversize: z.number().int(),
  bytes: z.number().int(),
});
export type GateCostBreakdown = z.infer<typeof GateCostBreakdown>;

/** One bucket as it read at the moment of a decision. Stored, so it need never be recomputed. */
export const GateBucket = z.object({
  scope: GateScope,
  principal: z.string(),
  /** Units the burst bucket holds when full, and how many were left before this email. */
  burstCapacity: z.number().int(),
  burstRemaining: z.number(),
  /** Units spent today against the cap, after the growth clamp. */
  dailyUsed: z.number().int(),
  dailyCap: z.number().int(),
});
export type GateBucket = z.infer<typeof GateBucket>;

export const GateVerdict = z.object({
  decision: GateDecision,
  reason: GateReason,
  /** Which scope refused. The address scope for an admit, since that is who it was about. */
  scope: GateScope,
  principal: z.string(),
  standing: GateStanding,
  units: z.number().int(),
  breakdown: GateCostBreakdown,
  buckets: z.array(GateBucket),
  /** True when the verdict actually stopped the email. False for every automatic hold in `observe`. */
  enforced: z.boolean(),
  /** When the refusing bucket will have room again, where that is knowable. */
  retryAfterMs: z.number().int().nullable(),
});
export type GateVerdict = z.infer<typeof GateVerdict>;

/** One principal on the senders pane. */
export const GateSenderRow = z.object({
  principal: z.string(),
  scope: GateScope,
  policy: GatePolicy,
  standing: GateStanding,
  /** What the bracket was decided on, so the row can say why it has the standing it has. */
  daysSeen: z.number().int(),
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
  unitsToday: z.number().int(),
  /** After the growth clamp, which is what actually applies. */
  dailyCap: z.number().int(),
  burstCapacity: z.number().int(),
  emailsToday: z.number().int(),
  heldToday: z.number().int(),
  /** Every hold ever recorded for this principal, enforced or not. */
  heldEver: z.number().int(),
  note: z.string().nullable(),
});
export type GateSenderRow = z.infer<typeof GateSenderRow>;

export const GateSenderList = z.object({ senders: z.array(GateSenderRow) });
export type GateSenderList = z.infer<typeof GateSenderList>;

/** The body of PUT /gate/senders/:principal. `auto` deletes the row. */
export const GatePolicyUpdate = z.object({
  scope: GateScope.exclude(["global"]),
  policy: GatePolicy,
  note: z.string().max(500).nullable().optional(),
});
export type GatePolicyUpdate = z.infer<typeof GatePolicyUpdate>;

/** One email in the holding pen, or one line of the decision log. */
export const GateHeldRow = z.object({
  id: z.string(),
  runId: z.string().nullable(),
  emailId: z.string(),
  from: z.string(),
  principal: z.string(),
  scope: GateScope,
  decision: GateDecision,
  reason: GateReason,
  standing: GateStanding,
  units: z.number().int(),
  breakdown: GateCostBreakdown,
  buckets: z.array(GateBucket),
  enforced: z.boolean(),
  decidedAt: z.string(),
  releasedAt: z.string().nullable(),
});
export type GateHeldRow = z.infer<typeof GateHeldRow>;

export const GateHeldList = z.object({ held: z.array(GateHeldRow) });
export type GateHeldList = z.infer<typeof GateHeldList>;

export const GateDecisionList = z.object({ decisions: z.array(GateHeldRow) });
export type GateDecisionList = z.infer<typeof GateDecisionList>;

/**
 * The day's money, and how close it is to the two thresholds. `level` is what
 * decide.ts reads; the rest is what the page draws.
 */
export const GateBudget = z.object({
  spentUsd: z.number(),
  budgetUsd: z.number(),
  /** spentUsd / budgetUsd, uncapped: a day may go over. */
  level: z.number(),
  /** Below this nothing happens; at it `unknown` and `new` are held. */
  squeezeAt: z.number(),
  /** At this only `trusted` and `established` are admitted. */
  haltAt: z.number(),
  readAt: z.string(),
});
export type GateBudget = z.infer<typeof GateBudget>;

export const GateOverview = z.object({
  mode: GateMode,
  budget: GateBudget,
  /** The global bucket as it now reads. Null when the meter cannot be reached. */
  global: GateBucket.nullable(),
  /** Every decision recorded today, and how many of them held something. */
  decisionsToday: z.number().int(),
  heldToday: z.number().int(),
  /** Held, enforced, and nobody has released them. What the second pane lists. */
  waiting: z.number().int(),
});
export type GateOverview = z.infer<typeof GateOverview>;

export const GateReleaseResult = z.object({ emailId: z.string(), runId: z.string() });
export type GateReleaseResult = z.infer<typeof GateReleaseResult>;
