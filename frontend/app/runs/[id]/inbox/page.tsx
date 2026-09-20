import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRun, listRunEmails } from "@/lib/api-client";

import { InboxPage } from "./inbox-page";

export const dynamic = "force-dynamic";

const RUN_ID = /^[0-9a-f-]{36}$/;

export async function generateMetadata({ params }: PageProps<"/runs/[id]/inbox">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Inbox ${id.slice(0, 8)} · Retina SDOC` };
}

/** Every email of one run, and nothing selected yet. */
export default async function Page({ params }: PageProps<"/runs/[id]/inbox">) {
  const { id } = await params;
  if (!RUN_ID.test(id)) notFound();
  const [run, list] = await Promise.all([getRun(id), listRunEmails(id, { pageSize: 200 })]);
  if (!run) notFound();
  return <InboxPage runId={id} initialList={list} review={run.review.open} />;
}
