import { mergeEntity } from "@/lib/api-client";

import { edit } from "../edit";

export async function POST(request: Request, ctx: RouteContext<"/api/ontology/[type]/[id]/merge">) {
  const { type, id } = await ctx.params;
  const body = (await request.json()) as { actor?: unknown; into?: unknown };
  if (typeof body.actor !== "string" || typeof body.into !== "string") return Response.json({ error: "A merge needs an actor and the thing to keep." }, { status: 400 });
  return edit(type, (kind) => mergeEntity(kind, id, body.actor as string, body.into as string), "merge two things");
}
