import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const RUN_ID = /^[0-9a-f-]{36}$/;
// Mirrors EMAIL_ID_REGEX in backend/src/emails.ts; change both or neither.
const EMAIL_ID = /^email_\d{1,6}$/;

/**
 * One email used to be a page beside the inbox, which meant two screens over
 * the same list, two selections and two ideas of which tab was open: arriving
 * from the inbox reset the list to a view nobody had chosen. The inbox opens
 * the email itself now.
 *
 * The route stays because the ontology, the chat, the queue panel and the
 * results table all link an email by it, and every one of those links should
 * still land on the email with its list around it.
 */
export default async function Page({ params }: PageProps<"/runs/[id]/emails/[emailId]">) {
  const { id, emailId } = await params;
  if (!RUN_ID.test(id) || !EMAIL_ID.test(emailId)) notFound();
  redirect(`/runs/${id}/inbox?email=${emailId}`);
}
