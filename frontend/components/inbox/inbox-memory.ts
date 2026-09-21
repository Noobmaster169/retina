import { z } from "zod";

import { FilterKey, SortKey } from "./inbox-filters";

/**
 * Where a person was in the inbox, so leaving for the ontology and coming back
 * lands on the email they were reading rather than on an empty pane.
 *
 * A cookie and not session storage, because the server renders this screen.
 * A cookie arrives with the request, so the page it produces is already the
 * remembered one: there is no second render, no flash of an empty pane, and
 * no browser-only value to reconcile against the server's markup.
 *
 * The search text is deliberately not remembered. A filter you chose is a way
 * of working and worth keeping; a half-typed word you left behind an hour ago
 * is a list that looks broken when you come back to it.
 *
 * One run at a time. "Where was I" has one answer, and remembering a screen
 * per run would restore a stale one the first time you switched.
 */

export const INBOX_COOKIE = "retina_inbox";
const KEEP_FOR_DAYS = 7;

export const InboxMemory = z.object({
  runId: z.string(),
  filter: FilterKey,
  sort: SortKey,
  /** The email that was open, or null where the list was showing and nothing was chosen. */
  email: z.string().nullable(),
});
export type InboxMemory = z.infer<typeof InboxMemory>;

/** What the cookie says, for the run being drawn. Null for a different run, a malformed value, or no cookie. */
export function recallInbox(raw: string | undefined, runId: string): InboxMemory | null {
  if (!raw) return null;
  const parsed = InboxMemory.safeParse(readJson(raw));
  if (!parsed.success || parsed.data.runId !== runId) return null;
  return parsed.data;
}

/** Browser side. Same-site and readable by script on purpose: the page that writes it is the page that needs it. */
export function rememberInbox(memory: InboxMemory): void {
  const value = encodeURIComponent(JSON.stringify(memory));
  document.cookie = `${INBOX_COOKIE}=${value}; path=/; max-age=${KEEP_FOR_DAYS * 24 * 60 * 60}; SameSite=Lax`;
}

/** A cookie someone else wrote reads as nothing remembered, which is what zod would make of it a line later anyway. */
function readJson(raw: string): unknown {
  try {
    return JSON.parse(decodeURIComponent(raw)) as unknown;
  } catch {
    return null;
  }
}
