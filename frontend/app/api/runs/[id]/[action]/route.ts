import { revalidateTag } from "next/cache";

import { cancelRun, pauseRun, resumeRun } from "@/lib/api-client";
import { RUNS } from "@/lib/api/cached";
import { hasSiteAccess } from "@/lib/site-gate";

const ACTIONS = { pause: pauseRun, resume: resumeRun, cancel: cancelRun };

function isAction(value: string): value is keyof typeof ACTIONS {
  // Not `in`: that also accepts inherited keys such as "constructor".
  return Object.hasOwn(ACTIONS, value);
}

/** Pause, resume or cancel one run. */
export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[id]/[action]">) {
  if (!(await hasSiteAccess())) {
    return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  }
  const { id, action } = await ctx.params;
  if (!isAction(action)) return Response.json({ error: "Unknown action" }, { status: 404 });

  try {
    const outcome = await ACTIONS[action](id);
    if (!outcome.ok) return Response.json({ error: outcome.message }, { status: outcome.status });
    // A run changed shape, so the ten seconds of reuse in `lib/api/cached.ts` end here.
    revalidateTag(RUNS, { expire: 0 });
    return Response.json(outcome.run);
  } catch (error) {
    console.error(`[api/runs] ${action} failed:`, error);
    return Response.json({ error: "Could not reach the backend." }, { status: 503 });
  }
}
