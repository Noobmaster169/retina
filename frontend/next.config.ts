import type { NextConfig } from "next";

/**
 * There was no config file at all, which meant every default applied, and one
 * of them was costing every navigation in the product.
 *
 * `staleTimes.dynamic` is how long the client router may reuse what it already
 * rendered for a route before asking the server again. It ships as `0`, so
 * going back to a page left a moment ago re-rendered it from nothing: the
 * server call, the backend reads behind it and the wait, a second time, for a
 * screen the browser was still holding.
 *
 * Thirty seconds is safe here rather than merely tolerable, because none of
 * the live screens depend on this render for freshness. The inbox, the runs
 * list, the senders and the held mail each poll their own data from the
 * browser on an interval of seconds (`components/inbox/use-run-inbox.ts` and
 * the tables beside it), so a reused shell corrects itself within one tick
 * while the person is still reading it. What the reuse saves is the wait.
 */
const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

export default nextConfig;
