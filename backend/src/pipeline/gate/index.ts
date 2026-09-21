/**
 * The gate's arithmetic. Everything here is pure: no database, no queue, no
 * Redis, no clock, no model. The adapters that feed it live in ingest/gate/.
 */

export { type CostInput, costOf, type GateCost } from "./cost";
export { BASELINE_DAYS, type ClampInput, clampDaily, median } from "./growth";
export { HALT_ADMITS, NEW_DAILY, SQUEEZE_HOLDS, type StandingInput, standingOf, type StandingResult } from "./standing";
export { decide, type DecideInput, type ScopeReading } from "./decide";
