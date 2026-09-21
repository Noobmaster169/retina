import { releaseHeld } from "@/lib/api-client";
import { backendFailure } from "@/lib/api-route";
import { hasSiteAccess } from "@/lib/site-gate";

/** Let one email out of the holding pen. The api refuses a second click on the same row. */
export async function POST(_request: Request, ctx: RouteContext<"/api/gate/held/[id]/release">) {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const outcome = await releaseHeld(id);
    if (!outcome.ok) return Response.json({ error: outcome.message }, { status: outcome.status });
    return Response.json(outcome.value);
  } catch (error) {
    return backendFailure("release an email", error);
  }
}
