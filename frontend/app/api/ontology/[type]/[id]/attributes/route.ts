import { editAttributes } from "@/lib/api-client";

import { edit } from "../edit";

export async function PATCH(request: Request, ctx: RouteContext<"/api/ontology/[type]/[id]/attributes">) {
  const { type, id } = await ctx.params;
  const body = (await request.json()) as { actor?: unknown; attributes?: unknown };
  if (typeof body.actor !== "string" || typeof body.attributes !== "object" || body.attributes === null) {
    return Response.json({ error: "An edit needs an actor and attributes." }, { status: 400 });
  }
  const attributes = body.attributes as Record<string, string | null>;
  return edit(type, (kind) => editAttributes(kind, id, body.actor as string, attributes), "edit a thing's attributes");
}
