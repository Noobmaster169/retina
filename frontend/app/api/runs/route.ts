import { revalidateTag } from "next/cache";

import { createRun, type CreateRunInput, listRuns } from "@/lib/api-client";
import { RUNS } from "@/lib/api/cached";
import { gatedRead } from "@/lib/api-route";
import { checkRunPassword, RUN_PASSWORD_HEADER, runGateConfigured } from "@/lib/run-gate";
import { hasSiteAccess } from "@/lib/site-gate";

function refused(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

/** What the runs table polls. A thin pass-through so the shared secret stays on the server. */
export async function GET() {
  return gatedRead("list runs", () => listRuns());
}

/**
 * Validation is the backend's job; its refusal comes back with its status.
 *
 * The password is checked here and not in the form, because a check the
 * browser does is a check anyone can skip by sending the request themselves.
 * Asked for every time: see `lib/run-gate.ts` for why there is no session.
 */
export async function POST(request: Request) {
  if (!(await hasSiteAccess())) return refused(401, "Signed out. Reload the page to sign in.");
  // Unset is refused too, and named apart: a gate nobody configured must not
  // read as a password somebody mistyped.
  if (!runGateConfigured()) {
    return refused(403, "No run password is set on this deployment, so no run can start. Set RUN_PASSWORD.");
  }
  if (!checkRunPassword(request.headers.get(RUN_PASSWORD_HEADER))) {
    return refused(403, "Wrong password. A run costs real model calls, so it asks every time.");
  }
  const body = (await request.json().catch(() => ({}))) as CreateRunInput;
  try {
    const outcome = await createRun(body);
    if (!outcome.ok) return refused(outcome.status, outcome.message);
    // A run changed shape, so the ten seconds of reuse in `lib/api/cached.ts` end here.
    revalidateTag(RUNS, { expire: 0 });
    return Response.json(outcome.run, { status: 201 });
  } catch (error) {
    console.error("[api/runs] create failed:", error);
    return refused(503, "Could not reach the backend.");
  }
}
