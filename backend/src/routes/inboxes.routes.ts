import { Router } from "express";
import { z } from "zod";

import type { InboxView } from "../contracts";
import { INBOXES, inboxUrl } from "../inboxes";

/**
 * The inboxes a new run may read, and how big each one is.
 *
 * The new-run form lists these rather than assuming one: it used to read the
 * single inbox's count off `/health`, which could only ever describe whichever
 * dataset that server had mounted. Each inbox is asked its own `/health`, the
 * email server's, which already reports its size and whether it can score.
 */

const PROBE_MS = 4000;

const ServerHealth = z.object({ emails: z.number(), scoring_available: z.boolean() });

async function probe(source: InboxView["source"], label: string, url: string): Promise<InboxView> {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(PROBE_MS) });
    const parsed = ServerHealth.safeParse(await response.json().catch(() => null));
    if (!response.ok || !parsed.success) return { source, label, reachable: false, emails: null, scoringAvailable: false };
    return { source, label, reachable: true, emails: parsed.data.emails, scoringAvailable: parsed.data.scoring_available };
  } catch {
    // An inbox that does not answer is a reading, not an error: it is listed
    // as unreachable and the form does not offer it.
    return { source, label, reachable: false, emails: null, scoringAvailable: false };
  }
}

export function inboxesRouter(): Router {
  const router = Router();
  router.get("/", async (_req, res) => {
    const configured = INBOXES.flatMap(({ source, label }) => {
      const url = inboxUrl(source);
      return url ? [{ source, label, url }] : [];
    });
    res.json({ inboxes: await Promise.all(configured.map(({ source, label, url }) => probe(source, label, url))) });
  });
  return router;
}
