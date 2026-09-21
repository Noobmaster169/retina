import { z } from "zod";

/**
 * Mirrors backend/src/contracts.gate.ts by hand. A drift fails here, naming
 * the field, instead of reaching the traffic page as undefined.
 *
 * Nothing in this file is a category. A verdict says whether we paid to read
 * an email, never what the email turned out to be.
 */

export const GateMode = z.enum(["off", "observe", "enforce"]);
export type GateMode = z.infer<typeof GateMode>;

export const GateScope = z.enum(["address", "domain", "global"]);
export type GateScope = z.infer<typeof GateScope>;

/** `auto` is the absence of a decision, not a third one a person makes. */
export const GatePolicy = z.enum(["auto", "allow", "block"]);
export type GatePolicy = z.infer<typeof GatePolicy>;

export const GateStanding = z.enum(["blocked", "trusted", "established", "regular", "new", "unknown"]);
export type GateStanding = z.infer<typeof GateStanding>;

export const GateDecision = z.enum(["admit", "hold"]);
export type GateDecision = z.infer<typeof GateDecision>;

export const GateReason = z.enum(["ok", "blocked_by_person", "burst", "daily", "budget", "meter_unavailable"]);
export type GateReason = z.infer<typeof GateReason>;

export const GateCostBreakdown = z.object({
  email: z.number().int(),
  attachments: z.number().int(),
  comparison: z.number().int(),
  oversize: z.number().int(),
  bytes: z.number().int(),
});
export type GateCostBreakdown = z.infer<typeof GateCostBreakdown>;

export const GateBucket = z.object({
  scope: GateScope,
  principal: z.string(),
  burstCapacity: z.number().int(),
  burstRemaining: z.number(),
  dailyUsed: z.number().int(),
  dailyCap: z.number().int(),
});
export type GateBucket = z.infer<typeof GateBucket>;

export const GateSenderRow = z.object({
  principal: z.string(),
  scope: GateScope,
  policy: GatePolicy,
  standing: GateStanding,
  daysSeen: z.number().int(),
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
  unitsToday: z.number().int(),
  dailyCap: z.number().int(),
  burstCapacity: z.number().int(),
  emailsToday: z.number().int(),
  heldToday: z.number().int(),
  heldEver: z.number().int(),
  note: z.string().nullable(),
});
export type GateSenderRow = z.infer<typeof GateSenderRow>;

export const GateSenderList = z.object({ senders: z.array(GateSenderRow) });
export type GateSenderList = z.infer<typeof GateSenderList>;

export const GatePolicyUpdate = z.object({
  scope: GateScope.exclude(["global"]),
  policy: GatePolicy,
  note: z.string().max(500).nullable().optional(),
});
export type GatePolicyUpdate = z.infer<typeof GatePolicyUpdate>;

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

export const GateBudget = z.object({
  spentUsd: z.number(),
  budgetUsd: z.number(),
  level: z.number(),
  squeezeAt: z.number(),
  haltAt: z.number(),
  readAt: z.string(),
});
export type GateBudget = z.infer<typeof GateBudget>;

export const GateOverview = z.object({
  mode: GateMode,
  budget: GateBudget,
  global: GateBucket.nullable(),
  decisionsToday: z.number().int(),
  heldToday: z.number().int(),
  waiting: z.number().int(),
});
export type GateOverview = z.infer<typeof GateOverview>;

export const GateReleaseResult = z.object({ emailId: z.string(), runId: z.string() });
export type GateReleaseResult = z.infer<typeof GateReleaseResult>;
