import type { Redis } from "ioredis";
import type { Pool } from "pg";

import { config } from "../../config";
import type { GateMode, GateScope, GateVerdict } from "../../contracts";
import { childLogger } from "../../lib/logger";
import { gateDecisions, gateSenders } from "../../ontology/repositories";
import { clampDaily, costOf, decide, type ScopeReading, standingOf } from "../../pipeline/gate";
import { senderDomain } from "../email-facts";
import type { EmailRecord } from "../source";
import { HALT_AT, readBudget, SQUEEZE_AT } from "./budget";
import { type BucketRequest, dayOf, type GateMeter, meterUnavailable, msUntilDayEnd } from "./meter";

const log = childLogger({ module: "gate" });

/**
 * Load, decide, record. Everything that decides anything is a pure function in
 * pipeline/gate; everything that knows about Redis is in meter.ts; everything
 * that knows SQL is in the two repositories. This file is the seam.
 */

export interface GateDeps {
  pool: Pool;
  redis: Redis | null;
  meter: GateMeter | null;
  /**
   * What the mode is for this caller. Only a test passes it, and only because
   * config.GATE_MODE is read once at boot: a test that wants to watch the gate
   * bite cannot restart the process to do it.
   */
  mode?: GateMode;
}

/** The full sender address, lowercased, as the narrowest thing an email names itself with. */
export function senderAddress(from: string): string {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
}

/**
 * The sender's standing is the domain's, not the address's.
 *
 * A brand new mailbox inside a domain that has mailed us for a year is
 * probably that customer, and the address bucket is what limits one mailbox
 * from flooding under cover of its domain. An explicit decision at the address
 * beats one at the domain, because it is the more specific thing a person said.
 */
function effectivePolicy(address: gateSenders.SenderRecord, domain: gateSenders.SenderRecord): gateSenders.SenderRecord["policy"] {
  return address.policy === "auto" ? domain.policy : address.policy;
}

function requestFor(scope: GateScope, principal: string, burst: number, daily: number): BucketRequest {
  return { scope, principal, burstCapacity: burst, refillPerSec: burst / config.GATE_BURST_REFILL_SECONDS, dailyCap: daily };
}

/** A bucket the meter could not read: capacities as configured, and nothing spent, so decide.ts sees no false room. */
function blankReading(request: BucketRequest): ScopeReading {
  return {
    scope: request.scope,
    principal: request.principal,
    standing: "unknown",
    burstCapacity: request.burstCapacity,
    burstRemaining: 0,
    dailyUsed: 0,
    dailyCap: request.dailyCap,
    refillPerSec: request.refillPerSec,
  };
}

/**
 * What the three buckets should be for this email, given what each principal
 * has earned. The caps are the pure functions' answers; the meter only counts.
 */
function bucketsFor(address: string, domain: string, records: { address: gateSenders.SenderRecord; domain: gateSenders.SenderRecord }) {
  const policy = effectivePolicy(records.address, records.domain);

  const addressStanding = standingOf({ policy, daysSeen: records.address.daysSeen, ageDays: records.address.ageDays });
  const domainStanding = standingOf({ policy, daysSeen: records.domain.daysSeen, ageDays: records.domain.ageDays });

  const addressDaily = clampDaily({
    standing: addressStanding.standing,
    standingDaily: addressStanding.daily,
    recentDailyUnits: records.address.recentDailyUnits,
  });
  const domainDaily = clampDaily({
    standing: domainStanding.standing,
    standingDaily: domainStanding.daily,
    recentDailyUnits: records.domain.recentDailyUnits,
  });

  return {
    // What the verdict is about, and what the budget breaker reads.
    standing: domainStanding.standing,
    requests: [
      requestFor("address", address, addressStanding.burst, addressDaily),
      requestFor("domain", domain, domainStanding.burst, domainDaily),
      requestFor("global", "global", config.GATE_GLOBAL_BURST, config.GATE_GLOBAL_DAILY),
    ],
    // Each bucket's own bracket, so a reading says which standing sized it.
    standings: [addressStanding.standing, domainStanding.standing, domainStanding.standing] as const,
  };
}

export interface GateOutcome {
  verdict: GateVerdict;
  /** The row id, so a hold can be found and released. */
  decisionId: string;
}

/**
 * Reaches a verdict about one email and writes it down.
 *
 * Never throws for a reason that is the gate's own: an unreadable meter is a
 * verdict (see decide.ts), not an error, because an outage in the thing that
 * counts must not become an outage in the thing that reads mail.
 */
export async function admit(deps: GateDeps, runId: string | null, record: EmailRecord): Promise<GateOutcome> {
  const address = senderAddress(record.from);
  const domain = senderDomain(record.from);
  const now = Date.now();

  const cost = costOf({
    subject: record.subject,
    body: record.body,
    attachments: record.attachments,
    attachmentBytes: record.attachment_bytes,
  });

  const found = await gateSenders.recordsFor(deps.pool, [
    { principal: address, scope: "address" },
    { principal: domain, scope: "domain" },
  ]);
  const records = {
    address: found.get(`address:${address}`) ?? (await gateSenders.recordFor(deps.pool, address, "address")),
    domain: found.get(`domain:${domain}`) ?? (await gateSenders.recordFor(deps.pool, domain, "domain")),
  };

  const { standing, requests, standings } = bucketsFor(address, domain, records);

  let readings: ScopeReading[];
  let meterAvailable = true;
  try {
    if (!deps.meter) throw new Error("no meter is configured");
    const charged = await deps.meter.charge(requests, cost.units, now, dayOf(now));
    readings = charged.map((reading, index) => ({ ...reading, standing: standings[index] ?? standing }));
  } catch (error) {
    meterUnavailable(error, record.email_id);
    readings = requests.map((request, index) => ({ ...blankReading(request), standing: standings[index] ?? standing }));
    meterAvailable = false;
  }

  const budget = deps.redis ? await readBudget(deps.redis) : { level: 0 };

  const verdict = decide({
    mode: deps.mode ?? config.GATE_MODE,
    cost,
    standing,
    principal: domain,
    readings,
    budgetLevel: budget.level,
    squeezeAt: SQUEEZE_AT,
    haltAt: HALT_AT,
    meterAvailable,
    msUntilDayEnd: msUntilDayEnd(now),
  });

  const decisionId = await gateDecisions.insert(deps.pool, { runId, emailId: record.email_id, from: record.from, verdict });
  await gateSenders.recordArrival(
    deps.pool,
    [
      { principal: address, scope: "address" },
      { principal: domain, scope: "domain" },
      { principal: "global", scope: "global" },
    ],
    cost.units,
    verdict.decision === "hold",
  );

  if (verdict.enforced) {
    log.info(
      { emailId: record.email_id, runId, principal: verdict.principal, scope: verdict.scope, reason: verdict.reason, units: verdict.units },
      "the gate held an email",
    );
  }

  return { verdict, decisionId };
}
