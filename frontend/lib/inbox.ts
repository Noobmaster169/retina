/**
 * Shared by the inbox page and the message page: read the list's search
 * params and load the page of summaries they describe. Server-side only.
 */
import { type EmailPage, listEmails } from "@/lib/api-client";

type SearchParams = Record<string, string | string[] | undefined>;

/** How the inbox list's position is carried in the URL. */
export interface InboxParams {
  q?: string;
  filter?: "attachments";
  page: number;
}

/** The query string that keeps the list where it is while a message is open. */
export function inboxQuery(params: InboxParams, overrides: Partial<InboxParams> = {}): string {
  const merged = { ...params, ...overrides };
  const search = new URLSearchParams();
  if (merged.q) search.set("q", merged.q);
  if (merged.filter) search.set("filter", merged.filter);
  if (merged.page > 1) search.set("page", String(merged.page));
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function readInboxParams(searchParams: SearchParams): InboxParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const page = Number(one(searchParams.page));
  const q = one(searchParams.q)?.trim();
  return {
    q: q || undefined,
    filter: one(searchParams.filter) === "attachments" ? "attachments" : undefined,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

export async function loadInbox(params: InboxParams): Promise<{ page: EmailPage | null; backendError: string | null }> {
  try {
    return { page: await listEmails(params), backendError: null };
  } catch (error) {
    return { page: null, backendError: error instanceof Error ? error.message : "Backend unreachable" };
  }
}
