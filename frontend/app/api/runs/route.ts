import { createRun, type CreateRunInput, listRuns } from "@/lib/api-client";
import { hasSiteAccess } from "@/lib/site-gate";

function refused(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

/** What the runs table polls. A thin pass-through so the shared secret stays on the server. */
export async function GET() {
  if (!(await hasSiteAccess())) return refused(401, "Signed out. Reload the page to sign in.");
  try {
    return Response.json(await listRuns());
  } catch (error) {
    console.error("[api/runs] list failed:", error);
    return refused(503, "Could not reach the backend.");
  }
}

/** Validation is the backend's job; its refusal comes back with its status. */
export async function POST(request: Request) {
  if (!(await hasSiteAccess())) return refused(401, "Signed out. Reload the page to sign in.");
  const body = (await request.json().catch(() => ({}))) as CreateRunInput;
  try {
    const outcome = await createRun(body);
    if (!outcome.ok) return refused(outcome.status, outcome.message);
    return Response.json(outcome.run, { status: 201 });
  } catch (error) {
    console.error("[api/runs] create failed:", error);
    return refused(503, "Could not reach the backend.");
  }
}
