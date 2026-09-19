import { getRunLive } from "@/lib/api-client";
import { passThrough } from "@/lib/api-route";

/** The run's model calls running right now, with what each has written so far. */
export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]/live">) {
  const { id } = await ctx.params;
  return passThrough("get run live", id, () => getRunLive(id));
}
