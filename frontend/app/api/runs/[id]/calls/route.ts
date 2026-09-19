import { z } from "zod";

import { listRunCalls } from "@/lib/api-client";
import { badQuery, passThrough } from "@/lib/api-route";

const Query = z.object({ after: z.coerce.number().int().nonnegative().optional() });

/** The run's newest model calls, for the live feed. `after` asks only for what is new. */
export async function GET(request: Request, ctx: RouteContext<"/api/runs/[id]/calls">) {
  const { id } = await ctx.params;
  const query = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return badQuery(query.error.issues);
  return passThrough("list run calls", id, async () => ({ calls: await listRunCalls(id, query.data.after) }));
}
