import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getEmail, getEmailTrace, listRunEmails } from "@/lib/api-client";

import { EmailPage } from "./email-page";

export const dynamic = "force-dynamic";

const RUN_ID = /^[0-9a-f-]{36}$/;
// Mirrors EMAIL_ID_REGEX in backend/src/emails.ts; change both or neither.
const EMAIL_ID = /^email_\d{1,6}$/;

export async function generateMetadata({ params }: PageProps<"/runs/[id]/emails/[emailId]">): Promise<Metadata> {
  const { emailId } = await params;
  return { title: `${emailId} · Retina SDOC` };
}

/**
 * The message comes from the inbox and the reading from the run. Two reads,
 * because they are two things: the seam on this page exists to say which is
 * which, and merging them into one payload would blur exactly what it draws.
 */
export default async function Page({ params }: PageProps<"/runs/[id]/emails/[emailId]">) {
  const { id, emailId } = await params;
  if (!RUN_ID.test(id) || !EMAIL_ID.test(emailId)) notFound();

  const [trace, email, list] = await Promise.all([
    getEmailTrace(id, emailId).catch(() => null),
    getEmail(emailId),
    listRunEmails(id, { pageSize: 50 }),
  ]);
  if (!trace || !email) notFound();

  return (
    <EmailPage
      runId={id}
      initialTrace={trace}
      subject={email.subject}
      message={{ from: email.from, subject: email.subject, body: email.body, attachments: email.attachments }}
      initialList={list}
    />
  );
}
