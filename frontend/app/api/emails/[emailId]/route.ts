import { getEmail } from "@/lib/api-client";
import { backendFailure } from "@/lib/api-route";
import { hasSiteAccess } from "@/lib/site-gate";

/** Mirrors EMAIL_ID_REGEX in backend/src/emails.ts; change both or neither. */
const EMAIL_ID = /^email_\d{1,6}$/;

/**
 * One message as the sender wrote it. It comes from the inbox and the reading
 * comes from the run: two reads, because the seam on the email page exists to
 * say which is which and one payload would blur exactly what it draws.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/emails/[emailId]">) {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  const { emailId } = await ctx.params;
  if (!EMAIL_ID.test(emailId)) return Response.json({ error: "No such email." }, { status: 404 });
  try {
    const email = await getEmail(emailId);
    if (!email) return Response.json({ error: "No such email." }, { status: 404 });
    return Response.json(email);
  } catch (error) {
    return backendFailure("get an email", error);
  }
}
