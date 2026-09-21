import { setGatePolicy } from "@/lib/api-client";
import { backendFailure } from "@/lib/api-route";
import { hasSiteAccess } from "@/lib/site-gate";

/**
 * Whitelist, blacklist, or back to being judged on its record. The body is
 * passed through unchanged: the api validates it and its refusal is what the
 * page shows, so checking it twice would only invent a second wording.
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/gate/senders/[principal]">) {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  const { principal } = await ctx.params;
  try {
    const outcome = await setGatePolicy(principal, await request.json());
    if (!outcome.ok) return Response.json({ error: outcome.message }, { status: outcome.status });
    return Response.json(outcome.value);
  } catch (error) {
    return backendFailure("set a gate policy", error);
  }
}
