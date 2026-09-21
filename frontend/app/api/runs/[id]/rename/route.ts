import { revalidateTag } from "next/cache";

import { renameRun } from "@/lib/api-client";
import { RUNS } from "@/lib/api/cached";
import { backendFailure } from "@/lib/api-route";
import { hasSiteAccess } from "@/lib/site-gate";

/**
 * What a person calls this run. The title on the run page writes here when it
 * loses focus, so a refusal has to come back as a message the field can show
 * rather than as a thrown error nobody sees.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/runs/[id]/rename">) {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  if (typeof body.name !== "string") return Response.json({ error: "A rename needs a name." }, { status: 400 });
  try {
    const outcome = await renameRun(id, body.name);
    if (outcome.ok) {
    // A run changed shape, so the ten seconds of reuse in `lib/api/cached.ts` end here.
    revalidateTag(RUNS, { expire: 0 });
      return Response.json(outcome.run);
    }
    return Response.json({ error: outcome.message }, { status: outcome.status });
  } catch (error) {
    return backendFailure("rename run", error);
  }
}
