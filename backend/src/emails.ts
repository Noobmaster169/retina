/**
 * The inbox. Read from the email server (emails/server, a FastAPI app that
 * serves data_v2 over HTTP) at EMAIL_SERVER_URL, held in memory and served
 * from there. The dataset is static and small (520 records), so one fetch
 * every few minutes is the whole sync story.
 *
 * The shapes below are the API contract; the frontend declares the same ones
 * in frontend/lib/api-client.ts. Keep them in step.
 */

import { z } from "zod";

import { config } from "./config";
import { INBOXES, inboxUrl } from "./inboxes";
import { EmailRecord } from "./ingest";
import { relayStatus, UpstreamError } from "./lib/errors";

/**
 * One record exactly as the email server stores it. The same schema the ingest
 * seam validates against: the webmail view and the pipeline read one inbox, so
 * they agree on its shape by construction rather than by two hand-written copies.
 */
export type Email = EmailRecord;

const Inbox = z.array(EmailRecord);

/** What the list view needs, and nothing more. */
export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  attachmentCount: number;
}

export interface ListQuery {
  q?: string;
  filter?: "attachments";
  page: number;
  limit: number;
}

export interface EmailPage {
  emails: EmailSummary[];
  total: number;
  page: number;
  limit: number;
  counts: { all: number; attachments: number };
}

const CACHE_TTL_MS = 5 * 60_000;
const SNIPPET_CHARS = 140;
// Mirrored in frontend/app/mail/[id]/page.tsx and app/attachments/[name]/route.ts,
// which reject a bad id before the round trip. Change all three or none.
export const EMAIL_ID_REGEX = /^email_\d{1,6}$/;
export const ATTACHMENT_NAME_REGEX = /^[\w.-]{1,128}$/;

function baseUrl(): string {
  return config.EMAIL_SERVER_URL.replace(/\/+$/, "");
}

/**
 * The webmail view speaks HTTP statuses to its own caller, so it reads the inbox
 * itself rather than through the `Source` seam, which speaks the pipeline's
 * retryable/terminal language instead. The record shape is shared; only the
 * error model differs.
 */
async function fetchFromServer(path: string, base = baseUrl()): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new UpstreamError(503, `email server unreachable: ${String(error)}`, { cause: error, retryable: true });
  }
  if (!response.ok) {
    throw new UpstreamError(relayStatus(response.status), `email server returned ${response.status} for ${path}`);
  }
  return response;
}

let cache: { loadedAt: number; emails: Email[] } | null = null;
let inflight: Promise<Email[]> | null = null;

/** The whole inbox, from memory when fresh. A failed load is not cached. */
async function loadInbox(): Promise<Email[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.emails;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const response = await fetchFromServer("/emails");
      const parsed = Inbox.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new UpstreamError(502, "the email server's inbox is not a list of emails");
      cache = { loadedAt: Date.now(), emails: parsed.data };
      return parsed.data;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function snippet(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_CHARS ? `${flat.slice(0, SNIPPET_CHARS - 1)}…` : flat;
}

function toSummary(email: Email): EmailSummary {
  return {
    id: email.email_id,
    from: email.from,
    subject: email.subject,
    snippet: snippet(email.body),
    attachmentCount: email.attachments.length,
  };
}

export async function listEmails(query: ListQuery): Promise<EmailPage> {
  const all = await loadInbox();
  const withAttachments = all.filter((e) => e.attachments.length > 0);
  let matched = query.filter === "attachments" ? withAttachments : all;

  const needle = query.q?.trim().toLowerCase();
  if (needle) {
    matched = matched.filter(
      (e) =>
        e.from.toLowerCase().includes(needle) ||
        e.subject.toLowerCase().includes(needle) ||
        e.body.toLowerCase().includes(needle),
    );
  }

  const start = (query.page - 1) * query.limit;
  return {
    emails: matched.slice(start, start + query.limit).map(toSummary),
    total: matched.length,
    page: query.page,
    limit: query.limit,
    counts: { all: all.length, attachments: withAttachments.length },
  };
}

/**
 * The other inboxes a run may have read, asked only for what the organisers'
 * one does not hold. A run of the synthetic inbox opens its emails through the
 * same routes as any other, so the email pane cannot tell which it came from;
 * this is where that stays true. Asked one record at a time rather than loaded
 * whole, because that inbox is ten times the size and is read an email at a time.
 */
async function fromOtherInboxes(path: string): Promise<Response | null> {
  for (const { source } of INBOXES) {
    const base = source === "averis" ? null : inboxUrl(source);
    if (!base) continue;
    try {
      return await fetchFromServer(path, base);
    } catch (error) {
      if (error instanceof UpstreamError && error.status === 404) continue;
      throw error;
    }
  }
  return null;
}

export async function getEmail(id: string): Promise<Email> {
  const email = (await loadInbox()).find((e) => e.email_id === id);
  if (email) return email;
  const elsewhere = await fromOtherInboxes(`/emails/${encodeURIComponent(id)}`);
  const parsed = elsewhere ? EmailRecord.safeParse(await elsewhere.json().catch(() => null)) : null;
  if (!parsed?.success) throw new UpstreamError(404, `no such email: ${id}`);
  return parsed.data;
}

/** The raw response from the email server, for streaming through. */
export async function fetchAttachment(name: string): Promise<Response> {
  const path = `/attachments/${encodeURIComponent(name)}`;
  try {
    return await fetchFromServer(path);
  } catch (error) {
    if (!(error instanceof UpstreamError && error.status === 404)) throw error;
    const elsewhere = await fromOtherInboxes(path);
    if (!elsewhere) throw error;
    return elsewhere;
  }
}
