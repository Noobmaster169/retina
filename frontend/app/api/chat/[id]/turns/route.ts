import { turnsAfter } from "@/lib/api-client";
import { gatedRead } from "@/lib/api-route";

/**
 * The turns of a conversation newer than one id, this turn's steps included.
 *
 * Polled once a second while a question is in flight, which is how the steps
 * appear one by one rather than all at once with the answer. It is a read of
 * rows already written, so it holds nothing open and costs no model call.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/chat/[id]/turns">) {
  const { id } = await ctx.params;
  const after = new URL(request.url).searchParams.get("after");
  if (after === null || !/^\d+$/.test(after)) {
    return Response.json({ error: "after must be a turn id" }, { status: 400 });
  }
  return gatedRead("read a conversation's steps", () => turnsAfter(id, Number(after)));
}
