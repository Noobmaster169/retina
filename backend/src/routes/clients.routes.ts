import { Router } from "express";
import type { Pool } from "pg";

import { ClientUpdate } from "../contracts";
import { childLogger } from "../lib/logger";
import { clients } from "../ontology/repositories";
import type { PriorityCache } from "../queues/priority-cache";

const log = childLogger({ module: "clients.routes" });

/**
 * The senders and their tier.
 *
 * A tier orders a queue. It decides no category, reaches no prompt, and
 * nothing downstream reads `kind` to classify anything: the model classifies
 * every email, whoever sent it. This route exists so a person can say which
 * client's work matters most when everything arrives at once.
 */

export interface ClientRouteDeps {
  pool: Pool;
  /** Written through on every change, so the next email queued does not wait for the hourly refresh. */
  priority: PriorityCache;
}

/** Lowercase, at least one dot, no path or scheme. What a sender domain looks like. */
const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function clientsRouter(deps: ClientRouteDeps): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json({ clients: await clients.list(deps.pool) });
  });

  router.put("/:domain", async (req, res) => {
    const domain = req.params.domain.trim().toLowerCase();
    if (!DOMAIN.test(domain)) {
      res.status(400).json({ error: "not a sender domain" });
      return;
    }
    const body = ClientUpdate.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "invalid client", issues: body.error.issues });
      return;
    }

    const row = await clients.upsert(deps.pool, domain, body.data);
    // Postgres first, then the cache: a cache holding a tier no row backs
    // would survive the next restart and order the queue by a number nobody
    // can see. The other way round costs at most one email at the old tier.
    await deps.priority.set(domain, row.tier);
    log.info({ domain, tier: row.tier, kind: row.kind }, "a person changed a client");
    res.json(row);
  });

  return router;
}
