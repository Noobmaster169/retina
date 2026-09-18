import express, { type NextFunction, type Request, type Response } from "express";
import type { Pool } from "pg";

import { requireCaller } from "./auth";
import type { HealthReport } from "./contracts";
import { EmailServerError } from "./emails";
import { RetryableError } from "./lib/errors";
import { childLogger } from "./lib/logger";
import { LlmProxyError } from "./llm";
import type { RunQueues } from "./queues/run-queues";
import { aiRouter } from "./routes/ai.routes";
import { emailsRouter } from "./routes/emails.routes";
import { runsRouter } from "./routes/runs.routes";

const log = childLogger({ module: "api" });

/** Everything the app reaches outside itself, so tests can hand in fakes. */
export interface AppDeps {
  pool: Pool;
  runQueues: RunQueues;
  health: () => Promise<HealthReport>;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Unauthenticated: the compose healthcheck has no key, and it reveals
  // nothing but liveness. Degraded is still 200, so a Redis or MinIO outage
  // does not make auto-deploy roll back a good image. Only a database the api
  // cannot reach is a 503, as it was before the other checks existed.
  app.get("/health", async (_req, res) => {
    const report = await deps.health();
    res.status(report.checks.postgres === "up" ? 200 : 503).json(report);
  });

  app.use(requireCaller);

  app.use("/ai", aiRouter());
  app.use("/emails", emailsRouter());
  app.use("/runs", runsRouter(deps));

  app.use(
    // Four parameters are what make Express treat this as an error handler.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof LlmProxyError || error instanceof EmailServerError) {
        res.status(error.status).json({ error: error.message });
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
