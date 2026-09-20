import { askQuestion } from "@/lib/api-client";
import { backendFailure } from "@/lib/api-route";
import { hasSiteAccess } from "@/lib/site-gate";

/**
 * One question, and the whole answer.
 *
 * A turn is eight model calls through a proxy that serves about half a request
 * a second, so this can take minutes. `maxDuration` is the platform's ceiling
 * and the client's timeout sits just under it, which is what makes a slow
 * answer a message the page can render rather than a platform error page.
 */
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/chat/[id]/messages">) {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as { content?: unknown; actor?: unknown };
    if (typeof body.content !== "string" || typeof body.actor !== "string") {
      return Response.json({ error: "A question needs content and an actor." }, { status: 400 });
    }
    const outcome = await askQuestion(id, body.content, body.actor);
    if (!outcome.ok) return Response.json({ error: outcome.message }, { status: 502 });
    return Response.json(outcome.value);
  } catch (error) {
    return backendFailure("ask a question", error);
  }
}
