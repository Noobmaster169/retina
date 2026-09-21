import { listEntities } from "@/lib/api-client";
import { badQuery, gatedRead } from "@/lib/api-route";
import { EntityKind } from "@/lib/api/semantic-schemas";

/** A kind's list, for the client-side filters on the business pages. */
export async function GET(_request: Request, ctx: RouteContext<"/api/ontology/[type]">) {
  const { type } = await ctx.params;
  const kind = EntityKind.safeParse(type);
  if (!kind.success) return badQuery(kind.error.issues);
  return gatedRead("list entities", () => listEntities(kind.data));
}
