import { describe, expect, it } from "vitest";

import type { GateHeldRow, GateSenderRow } from "@/lib/api/gate-schemas";

import { costLine, heldBecause, pressure, standingReason } from "./wording";

/**
 * The sentences the page puts in front of a person deciding whether to
 * whitelist a sender. Each one has to be something the row can stand behind,
 * so each one is checked against the numbers it claims to be describing.
 */

function sender(overrides: Partial<GateSenderRow> = {}): GateSenderRow {
  return {
    principal: "fujitogrp.com",
    scope: "domain",
    policy: "auto",
    standing: "regular",
    daysSeen: 4,
    firstSeen: "2026-08-12",
    lastSeen: "2026-09-21",
    unitsToday: 160,
    dailyCap: 1200,
    burstCapacity: 120,
    emailsToday: 10,
    heldToday: 0,
    heldEver: 0,
    note: null,
    ...overrides,
  };
}

function held(overrides: Partial<GateHeldRow> = {}): GateHeldRow {
  return {
    id: "1",
    runId: "r",
    emailId: "email_013",
    from: "docs@fujitogrp.com",
    principal: "fujitogrp.com",
    scope: "domain",
    decision: "hold",
    reason: "daily",
    standing: "new",
    units: 16,
    breakdown: { email: 3, attachments: 6, comparison: 7, oversize: 0, bytes: 9000 },
    buckets: [{ scope: "domain", principal: "fujitogrp.com", burstCapacity: 45, burstRemaining: 30, dailyUsed: 292, dailyCap: 300 }],
    enforced: true,
    decidedAt: "2026-09-21T09:15:00.000Z",
    releasedAt: null,
    ...overrides,
  };
}

describe("standingReason", () => {
  it("says how many days it has been seen on, because that is what decided the bracket", () => {
    expect(standingReason(sender())).toBe("Seen on 4 days, first on 12 Aug 2026");
  });

  it("does not say days in the plural for one day", () => {
    expect(standingReason(sender({ daysSeen: 1 }))).toContain("Seen on one day");
  });

  it("says nothing has arrived rather than showing a zero", () => {
    expect(standingReason(sender({ daysSeen: 0, firstSeen: null }))).toBe("Nothing has ever arrived from it");
  });

  it("names the person, not the arithmetic, when a person decided", () => {
    expect(standingReason(sender({ standing: "blocked", policy: "block" }))).toBe("Somebody blocked this sender");
    expect(standingReason(sender({ standing: "trusted", policy: "allow" }))).toBe("Somebody allowed this sender");
  });
});

describe("heldBecause", () => {
  it("quotes the day's numbers, including this email, so the sentence adds up", () => {
    expect(heldBecause(held())).toBe("fujitogrp.com is past its day: 308 of 300 units");
  });

  it("quotes what was left in the burst against what the email cost", () => {
    const burst = held({ reason: "burst", buckets: [{ scope: "domain", principal: "fujitogrp.com", burstCapacity: 45, burstRemaining: 4.7, dailyUsed: 100, dailyCap: 300 }] });
    expect(heldBecause(burst)).toBe("fujitogrp.com sent too much at once: 16 units against 4 left");
  });

  it("blames a person where a person is to blame", () => {
    expect(heldBecause(held({ reason: "blocked_by_person" }))).toBe("Somebody blocked fujitogrp.com");
  });

  it("says everyone together for the global bucket rather than naming a sender nobody recognises", () => {
    const global = held({ scope: "global", principal: "global", reason: "burst", buckets: [{ scope: "global", principal: "global", burstCapacity: 4000, burstRemaining: 9, dailyUsed: 100, dailyCap: 60000 }] });
    expect(heldBecause(global)).toContain("everyone together");
  });

  it("explains the budget and the meter without pretending a bucket refused", () => {
    expect(heldBecause(held({ reason: "budget" }))).toContain("day's budget is spent");
    expect(heldBecause(held({ reason: "meter_unavailable" }))).toContain("meter could not be read");
  });

  it("does not invent a bucket that is not in the row", () => {
    expect(heldBecause(held({ buckets: [] }))).toBe("Admitted");
  });
});

describe("costLine", () => {
  it("breaks the total into the parts it was made of", () => {
    expect(costLine(held())).toBe("16 units: 3 for the email, 6 for its documents, 7 for the comparison");
  });

  it("leaves out the parts that were zero", () => {
    const plain = held({ units: 3, breakdown: { email: 3, attachments: 0, comparison: 0, oversize: 0, bytes: 400 } });
    expect(costLine(plain)).toBe("3 units: 3 for the email");
  });

  it("names the size only when the email was big enough to be charged for it", () => {
    const huge = held({ units: 26, breakdown: { email: 3, attachments: 6, comparison: 7, oversize: 10, bytes: 1_300_000 } });
    expect(costLine(huge)).toContain("10 for its size");
  });
});

describe("pressure", () => {
  it.each([
    [0, 100, 0],
    [50, 100, 0.5],
    [100, 100, 1],
    [400, 100, 1],
    [-5, 100, 0],
  ])("%i of %i draws as %f", (used, cap, expected) => {
    expect(pressure(used, cap)).toBe(expected);
  });

  it("draws a cap of zero as full rather than as nothing, because a blocked sender has no room at all", () => {
    expect(pressure(0, 0)).toBe(1);
  });
});
