import { streamRun } from "@/lib/api-client";
import { backendFailure } from "@/lib/api-route";
import { hasSiteAccess } from "@/lib/site-gate";

/**
 * One run's progress, streamed.
 *
 * The backend's own stream is handed straight to the browser, body unread:
 * reading it here to re-emit it would buy nothing and cost the thing the
 * stream exists for. What it replaces is the run page polling `/runs/:id` and
 * `/runs/:id/queues` every two seconds each, which was a request a second
 * across the tunnel for as long as a tab was open.
 *
 * `maxDuration` is the platform's ceiling. A stream cut at it arrives at the
 * client as a close, which the page reconnects from, so the cost of a long
 * watch is one request every few minutes rather than one a second.
 */
export const maxDuration = 300;

export async function GET(request: Request, ctx: RouteContext<"/api/runs/[id]/stream">) {
  if (!(await hasSiteAccess())) {
    return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const upstream = await streamRun(id, request.signal);
    if (!upstream.ok || !upstream.body) {
      return Response.json({ error: `The run stream answered ${upstream.status}.` }, { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        // The same reason it is set on the backend: anything that buffers a
        // body holds every event until the stream closes.
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    return backendFailure("api/runs/stream", error);
  }
}
