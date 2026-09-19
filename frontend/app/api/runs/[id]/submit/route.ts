import { submitRun } from "@/lib/api-client";
import { hasSiteAccess } from "@/lib/site-gate";

/** Sends a run to the organisers' scorer. `?force=true` submits a run that still has unfinished emails. */
export async function POST(request: Request, ctx: RouteContext<"/api/runs/[id]/submit">) {
  if (!(await hasSiteAccess())) {
    return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const force = new URL(request.url).searchParams.get("force") === "true";

  try {
    const outcome = await submitRun(id, force);
    if (!outcome.ok) {
      return Response.json({ error: outcome.message, incomplete: outcome.incomplete }, { status: outcome.status });
    }
    return Response.json({ finalScore: outcome.finalScore }, { status: 201 });
  } catch (error) {
    console.error("[api/runs] submit failed:", error);
    return Response.json({ error: "Could not reach the backend." }, { status: 503 });
  }
}
