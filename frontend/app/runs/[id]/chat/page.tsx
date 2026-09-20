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
 */
export default async function Page({ params, searchParams }: PageProps<"/runs/[id]/chat">) {
  const { id } = await params;
  if (!RUN_ID.test(id)) notFound();

  const asked = await searchParams;
  const wanted = typeof asked.c === "string" ? asked.c : null;

  const conversations = await listConversations(id);
  // Falling back to the newest conversation of this run means a person who
  // comes back to the page lands where they left off, and the New button is
  // the way to start again.
  const open = wanted ?? conversations[0]?.id ?? null;
  const thread = open ? await getThread(open) : null;

  // Keyed by the conversation, so switching between two remounts the thread.
  // `useChat` seeds its turns from `initial` on mount and holds them after, to
  // avoid refetching an answer that cost real model calls; without the key that
  // same state survives the navigation and the new conversation opens showing
  // the previous one's answers.
  return <ChatPage key={open ?? "none"} runId={id} conversations={conversations} thread={thread} />;
}
