import express, { type NextFunction, type Request, type Response } from "express";
import type { Pool } from "pg";

import { requireCaller } from "./auth";
import { transactor } from "./db";
import type { HealthReport } from "./contracts";
import { RetryableError, UpstreamError } from "./lib/errors";
import { childLogger } from "./lib/logger";
import type { Scorer } from "./scorer/scorer";
import type { ObjectStore } from "./storage";
import type { PriorityCache } from "./queues/priority-cache";
import type { RunQueues } from "./queues/run-queues";
import { aiRouter } from "./routes/ai.routes";
import { clientsRouter } from "./routes/clients.routes";
import { promptsRouter } from "./routes/prompts.routes";
import { requestLog } from "./routes/request-log";
import { emailsRouter } from "./routes/emails.routes";
import { evalRouter } from "./routes/eval.routes";
import { filesRouter } from "./routes/files.routes";
import { reviewRouter } from "./routes/review.routes";
import type { LiveCalls } from "./live";
import { runQueuesRouter } from "./routes/run-queues.routes";
import { runTraceRouter } from "./routes/run-trace.routes";
import { runsRouter } from "./routes/runs.routes";
import { submissionsRouter } from "./routes/submissions.routes";

const log = childLogger({ module: "api" });

/** Everything the app reaches outside itself, so tests can hand in fakes. */
export interface AppDeps {
  pool: Pool;
  runQueues: RunQueues;
  /** Null where object storage is not configured; submitting a run then answers 503. */
  store: ObjectStore | null;
  scorer: Scorer;
  health: () => Promise<HealthReport>;
  /** Where a tier change is written through, so the next email queued reads it. */
  priority: PriorityCache;
  /** Where in-flight model calls are kept, for the run page. Absent, nothing shows as live. */
  live?: LiveCalls;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  // Before the body parser, so a request that fails to parse is still logged.
  app.use(requestLog());
  app.use(express.json({ limit: "1mb" }));

  // Unauthenticated: the compose healthcheck has no key, and it reveals
  // nothing but liveness. Degraded is still 200, so a MinIO restart, a cold
  // doc-extract or a worker one heartbeat late does not make auto-deploy roll
  // back a good image. Only postgres or redis, which the api cannot serve a
  // run without, are a 503. The report itself says which.
  app.get("/health", async (_req, res) => {
    const report = await deps.health();
    res.status(report.status === "down" ? 503 : 200).json(report);
  });

  app.use(requireCaller);

  app.use("/ai", aiRouter());
  app.use("/prompts", promptsRouter(deps));
  app.use("/clients", clientsRouter({ pool: deps.pool, priority: deps.priority }));
  app.use("/emails", emailsRouter());
  app.use("/runs", runsRouter(deps));
  app.use("/runs", runQueuesRouter(deps));
  app.use("/runs", runTraceRouter(deps));
  app.use("/runs", submissionsRouter(deps));
  app.use("/review", reviewRouter({ db: deps.pool, tx: transactor(deps.pool), store: deps.store, queues: deps.runQueues }));
  app.use("/files", filesRouter(deps));
  app.use("/eval", evalRouter(deps));

  app.use(
    // Four parameters are what make Express treat this as an error handler.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof UpstreamError) {
        // `retryable` travels with the body so a Retina api fronting another one
        // relays the far dependency's verdict instead of flattening it to a status.
        res.status(error.status).json({ error: error.message, retryable: error.retryable });
        return;
      }
      if (error instanceof RetryableError) {
        log.warn({ err: error.message }, "dependency unavailable");
        res.status(503).json({ error: error.message });
        return;
      }
      log.error({ err: error }, "unhandled");
      res.status(500).json({ error: "Internal error" });
    },
  );

  return app;
}
