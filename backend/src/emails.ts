/**
 * The inbox. Read from the email server (emails/server, a FastAPI app that
 * serves data_v2 over HTTP) at EMAIL_SERVER_URL, held in memory and served
 * from there. The dataset is static and small (520 records), so one fetch
 * every few minutes is the whole sync story.
 *
 * The shapes below are the API contract; the frontend declares the same ones
 * in frontend/lib/api-client.ts. Keep them in step.
 */

/** One record exactly as the email server stores it. */
export interface Email {
  email_id: string;
  from: string;
  subject: string;
  body: string;
  attachments: string[];
}

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

export class EmailServerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "EmailServerError";
  }
}

const CACHE_TTL_MS = 5 * 60_000;
const SNIPPET_CHARS = 140;
export const EMAIL_ID_REGEX = /^email_\d{1,6}$/;
export const ATTACHMENT_NAME_REGEX = /^[\w.-]{1,128}$/;

function baseUrl(): string {
  const url = process.env.EMAIL_SERVER_URL;
  if (!url) throw new EmailServerError("EMAIL_SERVER_URL is not set", 500);
  return url.replace(/\/+$/, "");
}

async function fetchFromServer(path: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new EmailServerError(`email server unreachable: ${String(error)}`, 503);
  }
  if (!response.ok) {
    throw new EmailServerError(`email server returned ${response.status} for ${path}`, response.status === 404 ? 404 : 502);
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
      const emails = (await response.json()) as Email[];
      cache = { loadedAt: Date.now(), emails };
      return emails;
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

export async function getEmail(id: string): Promise<Email> {
  const email = (await loadInbox()).find((e) => e.email_id === id);
  if (!email) throw new EmailServerError(`no such email: ${id}`, 404);
  return email;
}

/** The raw response from the email server, for streaming through. */
export async function fetchAttachment(name: string): Promise<Response> {
  return fetchFromServer(`/attachments/${encodeURIComponent(name)}`);
}
