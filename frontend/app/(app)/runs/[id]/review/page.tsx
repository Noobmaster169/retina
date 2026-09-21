import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const RUN_ID = /^[0-9a-f-]{36}$/;
const EMAIL_ID = /^email_\d{1,6}$/;

/**
 * `Needs a person` was a page of its own until it stopped earning one. It
 * listed the same emails the inbox lists, from a second component set with a
 * second idea of what was selected, and moving between the two lost your place
 * both ways. It is the inbox's `Needs you` chip now.
 *
 * The route stays so that every link anyone has ever been handed still opens
 * the right screen, with the same case open.
 */
export default async function Page({ params, searchParams }: PageProps<"/runs/[id]/review">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!RUN_ID.test(id)) notFound();

  const asked = Array.isArray(query.email) ? query.email[0] : query.email;
  const email = asked !== undefined && EMAIL_ID.test(asked) ? `&email=${asked}` : "";
  redirect(`/runs/${id}/inbox?filter=needs-you${email}`);
}
