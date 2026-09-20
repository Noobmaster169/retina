import { uploadToCase } from "@/lib/api-client";
import { backendFailure } from "@/lib/api-route";
import { hasSiteAccess } from "@/lib/site-gate";

/**
 * A document a person supplied, relayed to the api as the multipart it
 * arrived as. The bytes are checked there against the name the file claims,
 * which is the one place that can also refuse them.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/review/[id]/upload">) {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const outcome = await uploadToCase(id, await request.formData());
    if (!outcome.ok) return Response.json({ error: outcome.message }, { status: outcome.status });
    return Response.json(outcome.result);
  } catch (error) {
    return backendFailure("upload a document", error);
  }
}
