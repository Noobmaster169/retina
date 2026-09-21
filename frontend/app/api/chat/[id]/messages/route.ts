import { askQuestion, streamQuestion } from "@/lib/api-client";
import { ContextRef } from "@/lib/api/chat-agent-schemas";
import { backendFailure } from "@/lib/api-route";
import { hasSiteAccess } from "@/lib/site-gate";

/**
 * One question, and the answer as it is written.
 *
 * A turn is up to eight model calls through a proxy that starts an agent
 * session per call, so this can take minutes. `maxDuration` is the platform's
 * ceiling and the client's timeout sits just under it, which is what makes a
 * slow answer a message the page can render rather than a platform error page.
 *
 * With `Accept: text/event-stream` the backend's own stream is handed straight
 * to the browser, body unread. Reading it here to re-emit it would buy nothing
 * and cost the thing the stream exists for. Without it, the whole answer comes
 * back as one body, which is what a script or a server component gets.
 */
export const maxDuration = 300;

interface Asked {
  content: string;
  actor: string;
  skills: string[];
  context: ContextRef[];
}

/** The body, or the reason it is not one. Shared by both shapes of the route. */
function asked(body: {
  content?: unknown;
  actor?: unknown;
  skills?: unknown;
  context?: unknown;
}): Asked | { error: string } {
  if (typeof body.content !== "string" || typeof body.actor !== "string") {
    return { error: "A question needs content and an actor." };
  }
  return {
    content: body.content,
    actor: body.actor,
    skills: Array.isArray(body.skills) ? body.skills.filter((name): name is string => typeof name === "string") : [],
    // What the page offered and the person attached. A ref that does not parse is dropped here, not sent.
    context: Array.isArray(body.context)
      ? body.context.flatMap((ref) => (ContextRef.safeParse(ref).success ? [ContextRef.parse(ref)] : [])).slice(0, 5)
      : [],
  };
}

export async function POST(request: Request, ctx: RouteContext<"/api/chat/[id]/messages">) {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const body = asked((await request.json()) as Record<string, unknown>);
    if ("error" in body) return Response.json({ error: body.error }, { status: 400 });

    if (!(request.headers.get("accept") ?? "").includes("text/event-stream")) {
      const outcome = await askQuestion(id, body.content, body.actor, body.skills, body.context);
      if (!outcome.ok) return Response.json({ error: outcome.message }, { status: 502 });
      return Response.json(outcome.value);
    }

    // The browser's abort is the person pressing Stop, and it has to reach the
    // backend: that is how the loop learns to end the turn between steps and
    // store what it found.
    const upstream = await streamQuestion(id, body.content, body.actor, body.skills, body.context, request.signal);
    if (!upstream.ok || !upstream.body) {
      return Response.json({ error: `The backend refused the question with ${upstream.status}.` }, { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        // Vercel and any nginx in front of it buffer a body by default, which
        // holds every frame until the turn ends and undoes the streaming.
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    return backendFailure("ask a question", error);
  }
}
