import { getEntityPreview } from "@/lib/api-client";
import { gatedRead } from "@/lib/api-route";

/**
 * One resolved thing, small, for the card a chat mention opens on hover.
 * A body of `null` is an id nothing holds, and the card says so rather than
 * the hover failing.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/ontology/entity/[id]/preview">) {
  const { id } = await ctx.params;
  return gatedRead("read a resolved thing", () => getEntityPreview(id));
}
