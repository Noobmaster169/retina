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
  /**
   * `localhost` and `127.0.0.1` are the same machine and not the same origin,
   * and the dev server refuses a request for its own chunks from an origin it
   * was not started for. The page still renders, because that is the server's
   * own HTML; every script it asks for comes back 403, so nothing on it is
   * interactive and every value a client component was going to fetch stays at
   * whatever the server rendered. It looks like a bug in the page.
   *
   * Both names, because the README says one and a browser's address bar
   * remembers the other. Development only, and read by nothing in a build.
   */
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

export default nextConfig;
