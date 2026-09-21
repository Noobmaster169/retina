/**
 * The adapters the gate's arithmetic runs on: the Redis meter, the day's
 * budget, and the one function that loads, decides and records.
 *
 * Nothing here decides anything. Every decision is a pure function in
 * pipeline/gate.
 */

export { admit, type GateDeps, type GateOutcome, senderAddress } from "./gate";
export { BUDGET_KEY, HALT_AT, readBudget, refreshBudget, spentToday, SQUEEZE_AT } from "./budget";
export { type BucketReading, type BucketRequest, dayOf, type GateMeter, msUntilDayEnd, redisGateMeter } from "./meter";
