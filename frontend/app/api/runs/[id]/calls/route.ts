import { listRunCalls } from "@/lib/api-client";
import { passThrough } from "@/lib/api-route";

/** The run's newest model calls, for the live feed. `after` asks only for what is new. */
export async function GET(request: Request, ctx: RouteContext<"/api/runs/[id]/calls">) {
  const { id } = await ctx.params;
  const after = new URL(request.url).searchParams.get("after");
  return passThrough("list run calls", async () => ({ calls: await listRunCalls(id, after ? Number(after) : undefined) }));
}
