import { Router } from "express";
import type { Redis } from "ioredis";
import type { Pool } from "pg";

import { config } from "../config";
import { type GateSenderRow, GatePolicyUpdate } from "../contracts";
import { readBudget } from "../ingest";
import { childLogger } from "../lib/logger";
import { gateDecisions, gateSenderList, gateSenders, type SenderFacts } from "../ontology/repositories";
import { clampDaily, standingOf } from "../pipeline/gate";
import type { RunQueues } from "../queues/run-queues";

const log = childLogger({ module: "gate.routes" });

/**
 * What the gate is doing, and the two decisions a person may make about it.
 *
 * Nothing here decides a category. A policy set on this route changes whether
 * we pay to read a sender's mail, and never what the model says that mail is.
 *
 * The caps a row shows come from the same pure functions the enqueue path
 * calls, applied to the same facts, so the page and the gate cannot end up
 * quoting two different numbers at a person.
 */

export interface GateRouteDeps {
  pool: Pool;
  /** Null where Redis is not configured: the budget then reads as zero and the page says so. */
  redis: Redis | null;
  queues: RunQueues;
}

const DEFAULT_SENDERS = 500;
const MAX_SENDERS = 100_000;

/** A principal is a sender domain or a full address. Neither carries a scheme, a path or a space. */
const PRINCIPAL = /^[^\s/\\]{3,254}$/;

/** The facts a row holds, put through the arithmetic that turns them into a bracket and two caps. */
function toRow(facts: SenderFacts): GateSenderRow {
  const standing = standingOf({ policy: facts.policy, daysSeen: facts.daysSeen, ageDays: facts.ageDays });
  return {
    principal: facts.principal,
    scope: facts.scope,
    policy: facts.policy,
    standing: standing.standing,
    daysSeen: facts.daysSeen,
    firstSeen: facts.firstSeen,
    lastSeen: facts.lastSeen,
    unitsToday: facts.unitsToday,
    dailyCap: clampDaily({ standing: standing.standing, standingDaily: standing.daily, recentDailyUnits: facts.recentDailyUnits }),
    burstCapacity: standing.burst,
    emailsToday: facts.emailsToday,
    heldToday: facts.heldToday,
    heldEver: facts.heldEver,
    note: facts.note,
  };
}

export function gateRouter(deps: GateRouteDeps): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const [budget, tally, everyone] = await Promise.all([
      deps.redis ? readBudget(deps.redis) : Promise.resolve(zeroBudget()),
      gateDecisions.tally(deps.pool),
      // The day's global tally from Postgres rather than from the meter: it is
      // the same number, it survives a Redis restart, and this page must stay
      // readable exactly when Redis is the thing that went wrong.
      gateSenders.recordFor(deps.pool, "global", "global"),
    ]);
    res.json({
      mode: config.GATE_MODE,
      budget,
      global: {
        scope: "global",
        principal: "global",
        burstCapacity: config.GATE_GLOBAL_BURST,
        burstRemaining: Math.max(0, config.GATE_GLOBAL_BURST - everyone.unitsToday),
        dailyUsed: everyone.unitsToday,
        dailyCap: config.GATE_GLOBAL_DAILY,
      },
      ...tally,
    });
  });

  // Busiest today first, capped, because a real mailbox has more senders than
  // anyone scrolls. `limit` is how a caller that wants a particular one rather
  // than the busiest ones asks for it.
  router.get("/senders", async (req, res) => {
    const limit = Number(req.query.limit ?? DEFAULT_SENDERS);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SENDERS) {
      res.status(400).json({ error: `limit must be a whole number from 1 to ${MAX_SENDERS}` });
      return;
    }
    const facts = await gateSenderList.list(deps.pool, limit);
    res.json({ senders: facts.map(toRow) });
  });

  router.put("/senders/:principal", async (req, res) => {
    const principal = req.params.principal.trim().toLowerCase();
    if (!PRINCIPAL.test(principal)) {
      res.status(400).json({ error: "not a sender" });
      return;
    }
    const body = GatePolicyUpdate.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "invalid policy", issues: body.error.issues });
      return;
    }

    await gateSenders.setPolicy(deps.pool, principal, body.data.scope, body.data.policy, "a person", body.data.note ?? null);
    log.info({ principal, scope: body.data.scope, policy: body.data.policy }, "a person changed a gate policy");

    // Read back rather than echo: the row the page redraws should be the one
    // the enqueue path will read, caps and all. A sender nobody has heard from
    // has no facts to read, and its defaults are what the row should say.
    const facts = await gateSenderList.one(deps.pool, principal, body.data.scope);
    res.json(toRow(facts ?? blank(principal, body.data.scope, body.data.policy)));
  });

  router.get("/held", async (_req, res) => {
    res.json({ held: await gateDecisions.waiting(deps.pool) });
  });

  router.get("/decisions", async (_req, res) => {
    res.json({ decisions: await gateDecisions.recent(deps.pool) });
  });

  router.post("/held/:id/release", async (req, res) => {
    const id = req.params.id;
    if (!/^\d+$/.test(id)) {
      res.status(400).json({ error: "not a decision" });
      return;
    }

    const held = await gateDecisions.get(deps.pool, id);
    if (!held) {
      res.status(404).json({ error: "no such decision" });
      return;
    }
    if (held.releasedAt) {
      res.status(409).json({ error: "that email was already released" });
      return;
    }
    if (!held.runId) {
      res.status(409).json({ error: "that email belongs to no run, so there is nothing to release it into" });
      return;
    }

    // Stamped first. A release that enqueued and then failed to record itself
    // would offer the same email again on the next click and run it twice.
    const released = await gateDecisions.release(deps.pool, id, "a person");
    if (!released) {
      res.status(409).json({ error: "that email was already released" });
      return;
    }

    await deps.queues.releaseEmail(held.runId, held.emailId);
    log.info({ emailId: held.emailId, runId: held.runId }, "a person released an email the gate held");
    res.json({ emailId: held.emailId, runId: held.runId });
  });

  return router;
}

function zeroBudget() {
  return {
    spentUsd: 0,
    budgetUsd: config.GATE_DAILY_BUDGET_USD,
    level: 0,
    squeezeAt: 0.8,
    haltAt: 1,
    readAt: new Date().toISOString(),
  };
}

/** A principal nothing has ever arrived from, just decided about. It has a row to draw and no history. */
function blank(principal: string, scope: SenderFacts["scope"], policy: SenderFacts["policy"]): SenderFacts {
  return {
    principal,
    scope,
    policy,
    note: null,
    daysSeen: 0,
    ageDays: 0,
    firstSeen: null,
    lastSeen: null,
    unitsToday: 0,
    emailsToday: 0,
    heldToday: 0,
    heldEver: 0,
    recentDailyUnits: [],
  };
}
