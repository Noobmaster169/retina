import { deleteRun, getRun } from "@/lib/api-client";
import { backendFailure, passThrough } from "@/lib/api-route";
import { hasSiteAccess } from "@/lib/site-gate";

/** One run's summary, polled by its page. */
export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  return passThrough("get run", id, () => getRun(id));
}

/**
 * Drops a run and everything it produced. The refusal matters as much as the
 * success: a running run comes back 409 with a message telling the caller to
 * cancel it first, and the runs list shows that rather than a generic failure.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/runs/[id]">) {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const outcome = await deleteRun(id);
    if (outcome.ok) return new Response(null, { status: 204 });
    return Response.json({ error: outcome.message }, { status: outcome.status });
  } catch (error) {
    return backendFailure("delete run", error);
  }
}
