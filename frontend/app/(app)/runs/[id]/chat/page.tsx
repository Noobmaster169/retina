import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getThread, listConversations } from "@/lib/api-client";

import { ChatPage } from "./chat-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ask Retina · Retina SDOC" };

const RUN_ID = /^[0-9a-f-]{36}$/;

/**
 * Which conversation is open is in the URL, so a link to an answer is a link
 * to the answer and not to "whatever I was last reading".
 *
 * Only the list is waited for here. The thread is handed over as a promise the
 * page seeds the chat store from when it resolves, because waiting for it held
 * up the whole navigation: switching between two conversations sat on a
 * skeleton for a round trip even when the turns of both were already in this
 * session. Now the page draws immediately from what the store holds and the
 * server's copy merges in behind it.
 */
export default async function Page({ params, searchParams }: PageProps<"/runs/[id]/chat">) {
  const { id } = await params;
  if (!RUN_ID.test(id)) notFound();

  const asked = await searchParams;
  const wanted = typeof asked.c === "string" ? asked.c : null;

  // Every conversation, not this run's: the dock and this page are one history,
  // and a question asked on a company page belongs to no run. The list carries
  // each one's title and scope, which is everything the page frames a thread
  // with, so nothing here depends on the thread having arrived.
  const conversations = await listConversations();
  // Falling back to the newest conversation means a person who comes back to
  // the page lands where they left off, and New is the way to start again.
  const open = wanted ?? conversations[0]?.id ?? null;

  return <ChatPage runId={id} conversations={conversations} openId={open} thread={open ? getThread(open) : null} />;
}
