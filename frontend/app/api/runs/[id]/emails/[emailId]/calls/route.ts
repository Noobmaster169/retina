import { listEmailCalls } from "@/lib/api-client";
import { passThrough } from "@/lib/api-route";

/** Every model call for one email of the run: what was sent and what came back. */
export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]/emails/[emailId]/calls">) {
  const { id, emailId } = await ctx.params;
  return passThrough("list email calls", async () => ({ calls: await listEmailCalls(id, emailId) }));
}
