import { listEmailCalls } from "@/lib/api-client";
import { passThrough } from "@/lib/api-route";

/** Mirrors the backend's email id check. */
const EMAIL_ID = /^email_\w{1,32}$/;

/** Every model call for one email of the run: what was sent and what came back. */
export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]/emails/[emailId]/calls">) {
  const { id, emailId } = await ctx.params;
  if (!EMAIL_ID.test(emailId)) return Response.json({ error: "No such email." }, { status: 404 });
  return passThrough("list email calls", id, async () => ({ calls: await listEmailCalls(id, emailId) }));
}
