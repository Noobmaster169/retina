import { z } from "zod";

import { get, parseAs, request } from "./transport";

/** Mirrors backend/src/emails.ts; change both or neither. */

const Email = z.object({
  email_id: z.string(),
  from: z.string(),
  subject: z.string(),
  body: z.string(),
  /** Paths as the email server stores them: "attachments/email_004_SI.txt". */
  attachments: z.array(z.string()),
});
export type Email = z.infer<typeof Email>;

const EmailSummary = z.object({
  id: z.string(),
  from: z.string(),
  subject: z.string(),
  snippet: z.string(),
  attachmentCount: z.number(),
});
export type EmailSummary = z.infer<typeof EmailSummary>;

const EmailPage = z.object({
  emails: z.array(EmailSummary),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  counts: z.object({ all: z.number(), attachments: z.number() }),
});
export type EmailPage = z.infer<typeof EmailPage>;

export interface EmailListQuery {
  q?: string;
  filter?: "attachments";
  page?: number;
  limit?: number;
}

export async function listEmails(query: EmailListQuery = {}): Promise<EmailPage> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.filter) params.set("filter", query.filter);
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  return get(EmailPage, `/emails${params.size ? `?${params}` : ""}`);
}

/** Null when the id is unknown; throws when the backend is unreachable. */
export async function getEmail(id: string): Promise<Email | null> {
  const path = `/emails/${encodeURIComponent(id)}`;
  const response = await request(path);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Backend GET ${path} → ${response.status}`);
  return parseAs(Email, response, `GET ${path}`);
}

/** The backend's response as is, for streaming through to the browser. */
export async function fetchAttachment(name: string): Promise<Response> {
  return request(`/emails/attachments/${encodeURIComponent(name)}`, { timeoutMs: 60_000 });
}
