import { getEmailTrace } from "@/lib/api-client";
import { passThrough } from "@/lib/api-route";

/** Mirrors the backend's email id check. */
const EMAIL_ID = /^email_\w{1,32}$/;

/** One email of the run: its stage, how it was classified, the call running now, and every call made. */
export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]/emails/[emailId]/trace">) {
  const { id, emailId } = await ctx.params;
  if (!EMAIL_ID.test(emailId)) return Response.json({ error: "No such email." }, { status: 404 });
  return passThrough("get email trace", id, () => getEmailTrace(id, emailId));
}
