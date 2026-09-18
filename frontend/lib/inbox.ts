/**
 * Shared by the inbox page and the message page: read the list's search
 * params and load the page of summaries they describe. Server-side only.
 */
import { type EmailPage, listEmails } from "@/lib/api-client";
import type { InboxParams } from "@/components/mail-shell";

type SearchParams = Record<string, string | string[] | undefined>;

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
