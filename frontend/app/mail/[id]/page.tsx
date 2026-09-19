import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmailView, attachmentName } from "@/components/email-view";
import { MailShell } from "@/components/mail-shell";
import { inboxQuery } from "@/lib/inbox";
import { fetchAttachment, getEmail } from "@/lib/api-client";
import { loadInbox, readInboxParams } from "@/lib/inbox";

export const dynamic = "force-dynamic";

// Mirrors EMAIL_ID_REGEX in backend/src/emails.ts; change both or neither.
const EMAIL_ID = /^email_\d{1,6}$/;

export async function generateMetadata({ params }: PageProps<"/mail/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!EMAIL_ID.test(id)) return {};
  const email = await getEmail(id).catch(() => null);
  return email ? { title: `${email.subject} · Retina Mail` } : {};
}

/** Plain-text attachments are shown inline; anything else is a download. */
async function readTextPreviews(paths: string[]): Promise<Record<string, string>> {
  const names = paths.map(attachmentName).filter((n) => n.endsWith(".txt"));
  const entries = await Promise.all(
    names.map(async (name) => {
      const response = await fetchAttachment(name).catch(() => null);
      return response?.ok ? ([name, await response.text()] as const) : null;
    }),
  );
  return Object.fromEntries(entries.filter((e) => e !== null));
}

export default async function MailPage({ params, searchParams }: PageProps<"/mail/[id]">) {
  const { id } = await params;
  if (!EMAIL_ID.test(id)) notFound();

  const inboxParams = readInboxParams(await searchParams);
  const [{ page, backendError }, email] = await Promise.all([loadInbox(inboxParams), getEmail(id)]);
  if (!email) notFound();
  const previews = await readTextPreviews(email.attachments);

  return (
    <MailShell page={page} backendError={backendError} params={inboxParams} selectedId={id}>
      <EmailView email={email} previews={previews} backHref={`/${inboxQuery(inboxParams)}`} />
    </MailShell>
  );
}
