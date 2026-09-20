import { updateClient } from "@/lib/api-client";
import { backendFailure } from "@/lib/api-route";
import { hasSiteAccess } from "@/lib/site-gate";

/**
 * One client's tier, name or kind. The body is passed through unchanged: the
 * api validates it and its refusal is what the page shows, so checking it
 * twice would only invent a second wording.
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/clients/[domain]">) {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  const { domain } = await ctx.params;
  try {
    const outcome = await updateClient(domain, await request.json());
    if (!outcome.ok) return Response.json({ error: outcome.message }, { status: outcome.status });
    return Response.json(outcome.client);
  } catch (error) {
    return backendFailure("update a client", error);
  }
}
