import { describe, expect, it } from "vitest";

import type { GateMode, GateStanding } from "../../src/contracts";
import { costOf, decide, type DecideInput, type ScopeReading } from "../../src/pipeline/gate";

/** An ordinary email with an SI and a BL: sixteen units. */
const COST = costOf({ subject: "s", body: "b", attachments: ["a_SI.txt", "a_BL.txt"], attachmentBytes: [4000, 5000] });

function reading(overrides: Partial<ScopeReading> & Pick<ScopeReading, "scope" | "principal">): ScopeReading {
  return {
    standing: "regular",
    burstCapacity: 120,
    burstRemaining: 120,
    dailyUsed: 0,
    dailyCap: 1200,
    refillPerSec: 0.2,
    ...overrides,
  };
}

function input(overrides: Partial<DecideInput> = {}): DecideInput {
  return {
    mode: "enforce",
    cost: COST,
    standing: "regular",
    principal: "fujitogrp.com",
    readings: [
      reading({ scope: "address", principal: "docs@fujitogrp.com" }),
      reading({ scope: "domain", principal: "fujitogrp.com" }),
      reading({ scope: "global", principal: "global", burstCapacity: 4000, burstRemaining: 4000, dailyCap: 60_000 }),
    ],
    budgetLevel: 0,
    squeezeAt: 0.8,
    haltAt: 1,
    meterAvailable: true,
    msUntilDayEnd: 3_600_000,
    ...overrides,
  };
}

describe("decide", () => {
  it("admits an ordinary email from a sender with room", () => {
    const verdict = decide(input());
    expect(verdict).toMatchObject({ decision: "admit", reason: "ok", enforced: false, units: 16 });
  });

  it("carries the cost breakdown and every bucket into the verdict, so a row can justify itself", () => {
    const verdict = decide(input());
    expect(verdict.breakdown).toEqual(COST.breakdown);
    expect(verdict.buckets.map((bucket) => bucket.scope)).toEqual(["address", "domain", "global"]);
  });

  describe("the mode", () => {
    it("off admits without reaching a verdict about anyone", () => {
      const verdict = decide(input({ mode: "off", standing: "blocked" }));
      expect(verdict).toMatchObject({ decision: "admit", reason: "ok" });
    });

    it("observe reaches the hold and does not enforce it", () => {
      const verdict = decide(input({ mode: "observe", readings: [reading({ scope: "address", principal: "a", burstRemaining: 0 })] }));
      expect(verdict).toMatchObject({ decision: "hold", reason: "burst", enforced: false });
    });

    it("enforce holds for real", () => {
      const verdict = decide(input({ readings: [reading({ scope: "address", principal: "a", burstRemaining: 0 })] }));
      expect(verdict).toMatchObject({ decision: "hold", reason: "burst", enforced: true });
    });
  });

  describe("what a person decided", () => {
    const modes: GateMode[] = ["observe", "enforce"];
    for (const mode of modes) {
      it(`a block bites in ${mode}, because it is a decision and not a guess`, () => {
        const verdict = decide(input({ mode, standing: "blocked" }));
        expect(verdict).toMatchObject({ decision: "hold", reason: "blocked_by_person", enforced: true });
      });
    }

    it("a block is reached before the buckets are even consulted", () => {
      const verdict = decide(input({ standing: "blocked", readings: [] }));
      expect(verdict.reason).toBe("blocked_by_person");
    });
  });

  describe("the buckets", () => {
    it("blames the daily cap before the burst when both are out", () => {
      const verdict = decide(
        input({ readings: [reading({ scope: "address", principal: "a", burstRemaining: 0, dailyUsed: 1200 })] }),
      );
      expect(verdict.reason).toBe("daily");
    });

    it("refuses when the email would take the day past its cap, not once it already is", () => {
      const justFits = decide(input({ readings: [reading({ scope: "domain", principal: "d", dailyUsed: 1184 })] }));
      const justDoesNot = decide(input({ readings: [reading({ scope: "domain", principal: "d", dailyUsed: 1185 })] }));
      expect(justFits.decision).toBe("admit");
      expect(justDoesNot).toMatchObject({ decision: "hold", reason: "daily", scope: "domain" });
    });

    it("refuses on the burst when the bucket holds less than this email costs", () => {
      const exactly = decide(input({ readings: [reading({ scope: "address", principal: "a", burstRemaining: 16 })] }));
      const oneShort = decide(input({ readings: [reading({ scope: "address", principal: "a", burstRemaining: 15 })] }));
      expect(exactly.decision).toBe("admit");
      expect(oneShort).toMatchObject({ decision: "hold", reason: "burst", scope: "address" });
    });

    it("blames the narrowest scope first: one mailbox flooding does not accuse its domain", () => {
      const verdict = decide(
        input({
          readings: [
            reading({ scope: "address", principal: "spam@fujitogrp.com", burstRemaining: 0 }),
            reading({ scope: "domain", principal: "fujitogrp.com", burstRemaining: 0 }),
          ],
        }),
      );
      expect(verdict.scope).toBe("address");
    });

    it("catches an attacker rotating the local part at the domain", () => {
      const verdict = decide(
        input({
          readings: [
            reading({ scope: "address", principal: "fresh@fujitogrp.com" }),
            reading({ scope: "domain", principal: "fujitogrp.com", dailyUsed: 1200 }),
          ],
        }),
      );
      expect(verdict).toMatchObject({ decision: "hold", reason: "daily", scope: "domain" });
    });

    it("catches an attacker rotating domains at the global bucket", () => {
      const verdict = decide(
        input({
          readings: [
            reading({ scope: "address", principal: "a@one.example" }),
            reading({ scope: "domain", principal: "one.example" }),
            reading({ scope: "global", principal: "global", burstCapacity: 4000, burstRemaining: 4, dailyCap: 60_000 }),
          ],
        }),
      );
      expect(verdict).toMatchObject({ decision: "hold", reason: "burst", scope: "global" });
    });
  });

  describe("the retry hint", () => {
    it("says when the burst bucket will have room, from its own refill rate", () => {
      const verdict = decide(input({ readings: [reading({ scope: "address", principal: "a", burstRemaining: 6, refillPerSec: 0.2 })] }));
      expect(verdict.retryAfterMs).toBe(50_000);
    });

    it("says the end of the day for a daily refusal", () => {
      const verdict = decide(input({ readings: [reading({ scope: "address", principal: "a", dailyUsed: 1200 })], msUntilDayEnd: 7200_000 }));
      expect(verdict.retryAfterMs).toBe(7_200_000);
    });

    it("promises nothing when the email could never fit the bucket at all", () => {
      const huge = costOf({ subject: "", body: "", attachments: [], attachmentBytes: [] });
      const verdict = decide(
        input({ cost: { ...huge, units: 500 }, readings: [reading({ scope: "address", principal: "a", burstCapacity: 45, burstRemaining: 45 })] }),
      );
      expect(verdict).toMatchObject({ decision: "hold", reason: "burst", retryAfterMs: null });
    });
  });

  describe("the budget breaker", () => {
    const squeezed: { standing: GateStanding; decision: string }[] = [
      { standing: "unknown", decision: "hold" },
      { standing: "new", decision: "hold" },
      { standing: "regular", decision: "admit" },
      { standing: "established", decision: "admit" },
      { standing: "trusted", decision: "admit" },
    ];

    for (const { standing, decision } of squeezed) {
      it(`at 0.8 of the day's budget a ${standing} sender is ${decision}ted`, () => {
        expect(decide(input({ standing, budgetLevel: 0.8 })).decision).toBe(decision);
      });
    }

    const halted: { standing: GateStanding; decision: string }[] = [
      { standing: "unknown", decision: "hold" },
      { standing: "new", decision: "hold" },
      { standing: "regular", decision: "hold" },
      { standing: "established", decision: "admit" },
      { standing: "trusted", decision: "admit" },
    ];

    for (const { standing, decision } of halted) {
      it(`past the day's budget a ${standing} sender is ${decision}ted`, () => {
        expect(decide(input({ standing, budgetLevel: 1.4 })).decision).toBe(decision);
      });
    }

    it("changes nothing below the squeeze", () => {
      expect(decide(input({ standing: "unknown", budgetLevel: 0.79 })).decision).toBe("admit");
    });

    it("blames the global scope, because the money is nobody's fault in particular", () => {
      const verdict = decide(input({ standing: "unknown", budgetLevel: 1.2 }));
      expect(verdict).toMatchObject({ reason: "budget", scope: "global" });
    });

    it("never stops everyone, which is the outage an attacker is paying for", () => {
      expect(decide(input({ standing: "established", budgetLevel: 99 })).decision).toBe("admit");
    });
  });

  describe("with the meter away", () => {
    const fallback: { standing: GateStanding; decision: string }[] = [
      { standing: "trusted", decision: "admit" },
      { standing: "established", decision: "admit" },
      { standing: "regular", decision: "admit" },
      { standing: "new", decision: "hold" },
      { standing: "unknown", decision: "hold" },
    ];

    for (const { standing, decision } of fallback) {
      it(`a ${standing} sender is ${decision}ted: we fall back to what we already knew`, () => {
        const verdict = decide(input({ standing, meterAvailable: false }));
        expect(verdict.decision).toBe(decision);
        if (decision === "hold") expect(verdict.reason).toBe("meter_unavailable");
      });
    }

    it("still holds a sender a person blocked, which needs no meter to know", () => {
      expect(decide(input({ standing: "blocked", meterAvailable: false })).reason).toBe("blocked_by_person");
    });

    it("holds nothing while the mode is observe", () => {
      expect(decide(input({ mode: "observe", standing: "unknown", meterAvailable: false })).enforced).toBe(false);
    });
  });

  it("is the same verdict twice", () => {
    expect(decide(input())).toEqual(decide(input()));
  });
});
