import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { closePool } from "../../src/db";
import type { GateVerdict } from "../../src/contracts";
import { gateDecisions, gateSenderList, gateSenders } from "../../src/ontology/repositories";
import { inRollback, seedRun, uniqueEmailId } from "../db";

afterAll(closePool);

/** A principal no other test can have used. The gate keys on the sender and nothing else. */
function principal(): string {
  return `t-${randomUUID().slice(0, 8)}.example`;
}

function verdict(overrides: Partial<GateVerdict> = {}): GateVerdict {
  return {
    decision: "hold",
    reason: "burst",
    scope: "domain",
    principal: "somewhere.example",
    standing: "unknown",
    units: 16,
    breakdown: { email: 3, attachments: 6, comparison: 7, oversize: 0, bytes: 9000 },
    buckets: [{ scope: "domain", principal: "somewhere.example", burstCapacity: 20, burstRemaining: 4, dailyUsed: 16, dailyCap: 60 }],
    enforced: true,
    retryAfterMs: 60_000,
    ...overrides,
  };
}

describe("gate_policy", () => {
  it("stores what a person decided and reads it back", async () => {
    await inRollback(async (tx) => {
      const domain = principal();
      await gateSenders.setPolicy(tx, domain, "domain", "block", "a test", "sent 4000 emails on a Sunday");
      const record = await gateSenders.recordFor(tx, domain, "domain");
      expect(record).toMatchObject({ policy: "block", note: "sent 4000 emails on a Sunday" });
    });
  });

  it("is `auto` for a sender nobody has decided anything about", async () => {
    await inRollback(async (tx) => {
      expect((await gateSenders.recordFor(tx, principal(), "domain")).policy).toBe("auto");
    });
  });

  it("replaces a decision rather than adding a second one", async () => {
    await inRollback(async (tx) => {
      const domain = principal();
      await gateSenders.setPolicy(tx, domain, "domain", "block", "a test", null);
      await gateSenders.setPolicy(tx, domain, "domain", "allow", "a test", "a false alarm");
      expect(await gateSenders.recordFor(tx, domain, "domain")).toMatchObject({ policy: "allow", note: "a false alarm" });
    });
  });

  it("whitelists a blacklisted sender back by deleting the row, not by storing a third value", async () => {
    await inRollback(async (tx) => {
      const domain = principal();
      await gateSenders.setPolicy(tx, domain, "domain", "block", "a test", null);
      await gateSenders.setPolicy(tx, domain, "domain", "auto", "a test", null);
      expect((await gateSenders.recordFor(tx, domain, "domain")).policy).toBe("auto");
      const { rows } = await tx.query("select 1 from core.gate_policy where principal = $1", [domain]);
      expect(rows).toHaveLength(0);
    });
  });

  it("keeps an address decision and a domain decision apart", async () => {
    await inRollback(async (tx) => {
      const domain = principal();
      await gateSenders.setPolicy(tx, domain, "domain", "block", "a test", null);
      await gateSenders.setPolicy(tx, `docs@${domain}`, "address", "allow", "a test", null);
      expect((await gateSenders.recordFor(tx, domain, "domain")).policy).toBe("block");
      expect((await gateSenders.recordFor(tx, `docs@${domain}`, "address")).policy).toBe("allow");
    });
  });
});

describe("gate_activity", () => {
  it("adds one email and its units to the day, and counts a hold as traffic that arrived", async () => {
    await inRollback(async (tx) => {
      const domain = principal();
      await gateSenders.recordArrival(tx, [{ principal: domain, scope: "domain" }], 16, false);
      await gateSenders.recordArrival(tx, [{ principal: domain, scope: "domain" }], 20, true);

      const record = await gateSenders.recordFor(tx, domain, "domain");
      expect(record).toMatchObject({ emailsToday: 2, unitsToday: 36, heldToday: 1, daysSeen: 1 });
    });
  });

  it("counts both scopes of one email in one call", async () => {
    await inRollback(async (tx) => {
      const domain = principal();
      await gateSenders.recordArrival(
        tx,
        [
          { principal: `docs@${domain}`, scope: "address" },
          { principal: domain, scope: "domain" },
        ],
        16,
        false,
      );
      expect((await gateSenders.recordFor(tx, `docs@${domain}`, "address")).unitsToday).toBe(16);
      expect((await gateSenders.recordFor(tx, domain, "domain")).unitsToday).toBe(16);
    });
  });

  it("answers both principals of one email in one query", async () => {
    await inRollback(async (tx) => {
      const domain = principal();
      const found = await gateSenders.recordsFor(tx, [
        { principal: `docs@${domain}`, scope: "address" },
        { principal: domain, scope: "domain" },
      ]);
      expect(found.size).toBe(2);
      expect(found.get(`domain:${domain}`)).toMatchObject({ policy: "auto", daysSeen: 0 });
    });
  });

  it("returns a fortnight of daily totals with the quiet days present as zeros", async () => {
    await inRollback(async (tx) => {
      const domain = principal();
      await tx.query(
        `insert into core.gate_activity (principal, scope, day, emails, units, held)
         values ($1, 'domain', current_date - 3, 2, 32, 0), ($1, 'domain', current_date - 10, 1, 16, 0)`,
        [domain],
      );
      const record = await gateSenders.recordFor(tx, domain, "domain");
      expect(record.recentDailyUnits).toHaveLength(14);
      expect(record.recentDailyUnits.filter((units) => units > 0)).toEqual([16, 32]);
      expect(record.daysSeen).toBe(2);
    });
  });

  it("today is not in the fortnight, so a busy morning cannot raise its own ceiling", async () => {
    await inRollback(async (tx) => {
      const domain = principal();
      await gateSenders.recordArrival(tx, [{ principal: domain, scope: "domain" }], 500, false);
      expect((await gateSenders.recordFor(tx, domain, "domain")).recentDailyUnits.every((units) => units === 0)).toBe(true);
    });
  });
});

describe("gate_decisions", () => {
  it("writes a verdict and gives it back whole, buckets and all", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const emailId = uniqueEmailId();
      const id = await gateDecisions.insert(tx, { runId: run.id, emailId, from: "docs@somewhere.example", verdict: verdict() });

      const stored = await gateDecisions.get(tx, id);
      expect(stored).toMatchObject({ emailId, decision: "hold", reason: "burst", units: 16, enforced: true });
      expect(stored?.breakdown).toMatchObject({ email: 3, attachments: 6, comparison: 7 });
      expect(stored?.buckets).toHaveLength(1);
    });
  });

  it("lists the holding pen: held for real, and nobody has released it", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const heldId = await gateDecisions.insert(tx, { runId: run.id, emailId: uniqueEmailId(), from: "a@b.example", verdict: verdict() });
      await gateDecisions.insert(tx, {
        runId: run.id,
        emailId: uniqueEmailId(),
        from: "a@b.example",
        verdict: verdict({ decision: "admit", reason: "ok", enforced: false }),
      });
      // Reached but not enforced: the mode was observe. It is not waiting for anyone.
      await gateDecisions.insert(tx, { runId: run.id, emailId: uniqueEmailId(), from: "a@b.example", verdict: verdict({ enforced: false }) });

      // The holding pen is a global list and other tests in this database have
      // committed rows into it, so this asks only about the three it just made.
      const mine = new Set([heldId]);
      const pen = await gateDecisions.waiting(tx, 1000);
      expect(pen.filter((one) => one.runId === run.id).map((one) => one.id)).toEqual([...mine]);
    });
  });

  it("stamps a release and refuses a second one, so two clicks are not two emails", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const id = await gateDecisions.insert(tx, { runId: run.id, emailId: uniqueEmailId(), from: "a@b.example", verdict: verdict() });

      const released = await gateDecisions.release(tx, id, "a person");
      expect(released?.releasedAt).not.toBeNull();
      expect(await gateDecisions.release(tx, id, "a person")).toBeNull();
      expect((await gateDecisions.waiting(tx, 1000)).filter((one) => one.runId === run.id)).toEqual([]);
    });
  });

  it("leaves a hold with no run out of the pen: nothing could release it", async () => {
    await inRollback(async (tx) => {
      // What the drill script writes. It belongs in the log, not in a queue of
      // work, because the Release button beside it could only ever refuse.
      await gateDecisions.insert(tx, { runId: null, emailId: uniqueEmailId(), from: "a@b.example", verdict: verdict() });
      const before = await gateDecisions.tally(tx);
      await gateDecisions.insert(tx, { runId: null, emailId: uniqueEmailId(), from: "a@b.example", verdict: verdict() });

      expect((await gateDecisions.tally(tx)).waiting).toBe(before.waiting);
      expect((await gateDecisions.waiting(tx, 1000)).every((one) => one.runId !== null)).toBe(true);
    });
  });

  it("will not release something that was never held", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const id = await gateDecisions.insert(tx, {
        runId: run.id,
        emailId: uniqueEmailId(),
        from: "a@b.example",
        verdict: verdict({ decision: "admit", reason: "ok", enforced: false }),
      });
      expect(await gateDecisions.release(tx, id, "a person")).toBeNull();
    });
  });

  it("counts a run's holds once per email, however many verdicts it collected", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const emailId = uniqueEmailId();
      await gateDecisions.insert(tx, { runId: run.id, emailId, from: "a@b.example", verdict: verdict() });
      await gateDecisions.insert(tx, { runId: run.id, emailId, from: "a@b.example", verdict: verdict() });

      const held = await gateDecisions.heldByRun(tx, [run.id]);
      expect(held(run.id)).toBe(1);
    });
  });

  it("stops counting a hold against its run the moment a person releases it", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const id = await gateDecisions.insert(tx, { runId: run.id, emailId: uniqueEmailId(), from: "a@b.example", verdict: verdict() });
      await gateDecisions.release(tx, id, "a person");
      expect((await gateDecisions.heldByRun(tx, [run.id]))(run.id)).toBe(0);
    });
  });

  it("answers zero for a run that met no gate at all", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      expect((await gateDecisions.heldByRun(tx, [run.id]))(run.id)).toBe(0);
      expect((await gateDecisions.heldByRun(tx, []))(run.id)).toBe(0);
    });
  });
});

describe("the senders pane", () => {
  it("lists a sender that has emailed and one that was only ever decided about", async () => {
    await inRollback(async (tx) => {
      const emailed = principal();
      const decided = principal();
      await gateSenders.recordArrival(tx, [{ principal: emailed, scope: "domain" }], 16, false);
      await gateSenders.setPolicy(tx, decided, "domain", "block", "a test", null);

      const rows = await gateSenderList.list(tx, 100_000);
      const byPrincipal = new Map(rows.map((row) => [row.principal, row]));
      expect(byPrincipal.get(emailed)).toMatchObject({ policy: "auto", unitsToday: 16, emailsToday: 1 });
      expect(byPrincipal.get(decided)).toMatchObject({ policy: "block", unitsToday: 0, daysSeen: 0 });
    });
  });

  it("leaves the global bucket out: it is not a sender and must not be blacklistable", async () => {
    await inRollback(async (tx) => {
      await gateSenders.recordArrival(tx, [{ principal: "global", scope: "global" }], 16, false);
      const rows = await gateSenderList.list(tx, 100_000);
      expect(rows.some((row) => row.scope === "global")).toBe(false);
    });
  });

  it("carries every hold a sender has ever collected, not only today's", async () => {
    await inRollback(async (tx) => {
      const domain = principal();
      await tx.query(
        `insert into core.gate_activity (principal, scope, day, emails, units, held)
         values ($1, 'domain', current_date - 2, 5, 80, 3)`,
        [domain],
      );
      await gateSenders.recordArrival(tx, [{ principal: domain, scope: "domain" }], 16, true);

      const row = (await gateSenderList.list(tx, 100_000)).find((one) => one.principal === domain);
      expect(row).toMatchObject({ heldEver: 4, heldToday: 1, daysSeen: 2 });
    });
  });
});
