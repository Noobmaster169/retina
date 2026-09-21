import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { z } from "zod";

import { FilterKey, SortKey } from "@/components/inbox/inbox-filters";
import { INBOX_COOKIE, recallInbox } from "@/components/inbox/inbox-memory";
import type { InboxParams } from "@/components/inbox/use-inbox-view";
import { getRun, listRunEmails } from "@/lib/api-client";

import { InboxPage } from "./inbox-page";

export const dynamic = "force-dynamic";

const RUN_ID = /^[0-9a-f-]{36}$/;
// Mirrors EMAIL_ID_REGEX in backend/src/emails.ts; change both or neither.
const EMAIL_ID = /^email_\d{1,6}$/;

export async function generateMetadata({ params }: PageProps<"/runs/[id]/inbox">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Inbox ${id.slice(0, 8)} · Retina SDOC` };
}

/**
 * Every email of one run, and whichever one was open.
 *
 * The screen is settled here and not in the browser. The address bar says what
 * someone is looking at and the cookie says where they were, and merging them
 * on the server means the first paint is already the right screen: no second
 * render, no flash of an empty pane, and nothing browser-only to reconcile
 * against this markup.
 */
export default async function Page({ params, searchParams }: PageProps<"/runs/[id]/inbox">) {
  const { id } = await params;
  if (!RUN_ID.test(id)) notFound();

  const [query, jar, run, list] = await Promise.all([
    searchParams,
    cookies(),
    getRun(id),
    listRunEmails(id, { pageSize: 200 }),
  ]);
  if (!run) notFound();

  const said = asked(query);
  const remembered = recallInbox(jar.get(INBOX_COOKIE)?.value, id);
  // The URL wins wherever it says anything: a link someone was handed is an
  // instruction, and where this browser last was is only a habit. The search
  // is never remembered, so it is only ever what the URL says.
  const opening: InboxParams = {
    filter: said.filter ?? remembered?.filter,
    sort: said.sort ?? remembered?.sort,
    q: said.q,
    email: said.email ?? remembered?.email ?? undefined,
  };

  return <InboxPage runId={id} initialList={list} params={opening} />;
}

/** What the address bar asked for. Anything malformed is treated as unasked, never as a refusal. */
function asked(query: Record<string, string | string[] | undefined>): InboxParams {
  const email = first(query.email);
  return {
    filter: parsed(FilterKey, first(query.filter)),
    sort: parsed(SortKey, first(query.sort)),
    q: first(query.q)?.slice(0, 200),
    email: email !== undefined && EMAIL_ID.test(email) ? email : undefined,
  };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsed<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}
