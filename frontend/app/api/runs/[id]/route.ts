import { getRun } from "@/lib/api-client";
import { passThrough } from "@/lib/api-route";

/** One run's summary, polled by its page. */
export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  return passThrough("get run", id, () => getRun(id));
}
