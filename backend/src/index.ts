import net from "node:net";

import { createApp } from "./app";
import { getPool } from "./db";

// Node's Happy Eyeballs gives each candidate address 250ms to connect, which
// cold connections from some networks blow through and fail as ETIMEDOUT.
// This is a connect-attempt budget, not a request timeout.
net.setDefaultAutoSelectFamilyAttemptTimeout(5000);

const port = Number(process.env.PORT ?? "8091");

const server = createApp().listen(port, () => {
  console.log(`[api] listening on :${port}`);
});
// A cold model plus a long generation can outlast Node's default 5-minute
// request timeout; the llm client's own 600s ceiling is the binding one.
server.requestTimeout = 660_000;
server.headersTimeout = 665_000;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      getPool()
        .end()
        .catch(() => {})
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
