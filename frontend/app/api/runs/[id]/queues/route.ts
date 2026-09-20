import { getRunQueues } from "@/lib/api-client";
import { passThrough } from "@/lib/api-route";

/** Who holds each queue slot of one run, polled by its page while the run is live. */
export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]/queues">) {
  const { id } = await ctx.params;
  return passThrough("get run queues", id, () => getRunQueues(id));
}
