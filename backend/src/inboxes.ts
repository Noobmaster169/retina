import { config } from "./config";
import type { RunSource } from "./contracts";

/**
 * Where each inbox a run may read is served.
 *
 * Every inbox here is the same email server image with a different dataset
 * mounted, so every one of them answers the same four routes: the list, one
 * email, an attachment, and `POST /submit`, which scores against the answer
 * key that dataset carries. That is what makes the 5,000 behave exactly as the
 * organisers' 520 does: nothing downstream knows which it is reading.
 *
 * The one place a source becomes a URL. The worker's ingest, the api's scorer,
 * the webmail and the list of inboxes offered to a new run all ask here, so a
 * run cannot ingest from one inbox and be scored against another.
 */

export interface Inbox {
  source: RunSource;
  label: string;
}

/** In the order the new-run form offers them. The organisers' first: it is what the judges score. */
export const INBOXES: Inbox[] = [
  { source: "averis", label: "Organisers' inbox" },
  { source: "synthetic_5k", label: "Synthetic inbox" },
];

/** Null where this deployment was not given that inbox. */
export function inboxUrl(source: RunSource): string | null {
  const url = source === "averis" ? config.EMAIL_SERVER_URL : config.EMAIL_SERVER_5K_URL;
  return url ? url.replace(/\/+$/, "") : null;
}
