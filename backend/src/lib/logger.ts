import pino, { type Logger } from "pino";

import { config } from "../config";

const root = pino({
  level: config.LOG_LEVEL,
  transport: config.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
});

/** One per module. Bind `runId`, `emailId` and `stage` whenever they are known. */
export function childLogger(bindings: Record<string, unknown>): Logger {
  return root.child(bindings);
}
