import { getReviewCase } from "@/lib/api-client";
import { backendFailure } from "@/lib/api-route";
import { hasSiteAccess } from "@/lib/site-gate";

/** One case with its history. */
export async function GET(_request: Request, ctx: RouteContext<"/api/review/[id]">) {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const found = await getReviewCase(id);
    if (!found) return Response.json({ error: "No such case." }, { status: 404 });
    return Response.json(found);
  } catch (error) {
    return backendFailure("get review case", error);
  }
}
