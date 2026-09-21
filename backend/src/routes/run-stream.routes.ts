import { Router } from "express";
import type { Pool } from "pg";

import type { RunQueuesView, RunSummary } from "../contracts";
import { childLogger } from "../lib/logger";
import { runs } from "../ontology/repositories";
import type { RunQueues } from "../queues/run-queues";
import { runIdParam } from "./params";
import { summaryOf } from "./run-summaries";
import { eventStream } from "./sse";

const log = childLogger({ module: "run-stream.routes" });

/**
 * One run's progress, as a stream the page holds open instead of polling.
 *
 * The run page used to poll two endpoints every two seconds each, which is a
 * request a second, every second, for as long as a tab was open, and every one
 * of them crossed the tunnel. This is one connection: the reads still happen on
 * a tick, but on this side of the tunnel, and only what changed is sent.
 *
 * Two named events, because the page draws them from two shapes it already
 * has: `summary` is what `GET /runs/:id` answers, `queues` is what
 * `GET /runs/:id/queues` answers. Both of those stay, for a client that would
 * rather ask once, and neither has a second definition here: the stream calls
 * the same builders they do.
 *
 * It ends itself when the run is finished. A page that never disconnects is
 * the other way to spend a tunnel.
 */

export interface RunStreamDeps {
  pool: Pool;
  runQueues: RunQueues;
  /** Builds the same body `GET /runs/:id/queues` answers with. */
  queuesFor(runId: string): Promise<RunQueuesView>;
}

/** How often the reads run. On this side of the tunnel, so it is Postgres and Redis, not a request. */
const TICK_MS = 2000;

/**
 * A stream that has sent nothing for this long sends a comment, which keeps
 * ngrok and any proxy between from closing a connection they think is dead.
 */
const KEEPALIVE_MS = 20_000;

/** A finished run is still watched briefly, so the page sees the last numbers land before the stream closes. */
const LINGER_TICKS = 2;

export function runStreamRouter(deps: RunStreamDeps): Router {
  const router = Router();
  const { pool, runQueues, queuesFor } = deps;

  router.get("/:id/stream", async (req, res) => {
    const runId = runIdParam(req, res);
    if (!runId) return;
    if ((await runs.status(pool, runId)) === null) {
      res.status(404).json({ error: "no such run" });
      return;
    }

    const stream = eventStream(res);
    let open = true;
    let lastSummary = "";
    let lastQueues = "";
    let lastSent = Date.now();
    let settled = 0;

    const tick = async (): Promise<void> => {
      const run = await runs.get(pool, runId);
      if (!run) {
        stream.send("gone", { runId });
        finish();
        return;
      }
      const [summary, queues] = await Promise.all([summaryOf(pool, runQueues, run), queuesFor(runId)]);
      // Only what moved. A board whose numbers are the same as a tick ago has
      // nothing to say, and saying it anyway is the polling this replaced.
      if (send("summary", summary, lastSummary, (json) => (lastSummary = json))) lastSent = Date.now();
      if (send("queues", queues, lastQueues, (json) => (lastQueues = json))) lastSent = Date.now();
      if (Date.now() - lastSent > KEEPALIVE_MS) {
        stream.send("still-here", {});
        lastSent = Date.now();
      }
      // Finished runs stop polling on the client too, so this is belt and
      // braces; the linger is what carries the last tick's numbers over.
      if (summary.processingDone && ++settled > LINGER_TICKS) {
        stream.send("done", { runId });
        finish();
      }
    };

    function send(event: string, body: RunSummary | RunQueuesView, was: string, keep: (json: string) => void): boolean {
      const json = JSON.stringify(body);
      if (json === was) return false;
      keep(json);
      stream.send(event, body);
      return true;
    }

    function finish(): void {
      if (!open) return;
      open = false;
      clearInterval(timer);
      stream.end();
    }

    const timer = setInterval(() => {
      if (!open) return;
      void tick().catch((error: unknown) => {
        // A failed read is this tick's problem, not the stream's: the next one
        // is two seconds away and the page has what it last drew.
        log.warn({ runId, err: error instanceof Error ? error.message : String(error) }, "a run stream tick failed");
      });
    }, TICK_MS);

    // The page navigating away, the tab closing, the tunnel dropping: all of
    // them land here, and none of them may leave a timer reading the database.
    req.on("close", finish);

    await tick().catch(() => undefined);
  });

  return router;
}
