import { actOnCase } from "@/lib/api-client";
import { backendFailure } from "@/lib/api-route";
import { hasSiteAccess } from "@/lib/site-gate";

/**
 * One write against one case. The body is passed through unchanged: the api
 * validates it per kind and its refusal is what the page shows, so checking it
 * twice would only invent a second wording.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/review/[id]/actions">) {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const outcome = await actOnCase(id, await request.json());
    if (!outcome.ok) return Response.json({ error: outcome.message }, { status: outcome.status });
    return Response.json(outcome.result);
  } catch (error) {
    return backendFailure("write a review action", error);
  }
}
