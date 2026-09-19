import { z } from "zod";

import { hasSiteAccess } from "@/lib/site-gate";

/** Mirrors the backend's run id check: a run id is a uuid. */
const RunId = z.uuid();

/**
 * A read the browser polls, passed through to the backend so the shared
 * secret stays on the server. Signed out is a JSON 401, never the login page;
 * a run id that cannot exist is a 404 without asking the backend; a backend
 * failure is a 503 the poller can show.
 */
export async function passThrough(what: string, runId: string, read: () => Promise<unknown>): Promise<Response> {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  if (!RunId.safeParse(runId).success) return Response.json({ error: "No such run." }, { status: 404 });
  try {
    const body = await read();
    if (body === null) return Response.json({ error: "No such run." }, { status: 404 });
    return Response.json(body);
  } catch (error) {
    console.error(`[api] ${what} failed:`, error);
    return Response.json({ error: "Could not reach the backend." }, { status: 503 });
  }
}

/** A query the page sent that the backend would refuse: answered here as a 400, not passed on and misread as an outage. */
export function badQuery(issues: z.core.$ZodIssue[]): Response {
  const [issue] = issues;
  return Response.json({ error: `Bad query at ${issue?.path.join(".") || "(root)"}: ${issue?.message}` }, { status: 400 });
}
