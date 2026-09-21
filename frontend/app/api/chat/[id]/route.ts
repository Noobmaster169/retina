import { getThread } from "@/lib/api-client";
import { gatedRead } from "@/lib/api-route";

/** One conversation with its turns, for the dock resuming what it left. A 404 is `null` here and the dock starts fresh. */
export async function GET(_request: Request, ctx: RouteContext<"/api/chat/[id]">) {
  const { id } = await ctx.params;
  return gatedRead("read a conversation", async () => ({ thread: await getThread(id) }));
}
