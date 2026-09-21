import { renameEntity } from "@/lib/api-client";

import { edit } from "../edit";

export async function POST(request: Request, ctx: RouteContext<"/api/ontology/[type]/[id]/rename">) {
  const { type, id } = await ctx.params;
  const body = (await request.json()) as { actor?: unknown; name?: unknown };
  if (typeof body.actor !== "string" || typeof body.name !== "string") return Response.json({ error: "A rename needs an actor and a name." }, { status: 400 });
  return edit(type, (kind) => renameEntity(kind, id, body.actor as string, body.name as string), "rename a thing");
}
