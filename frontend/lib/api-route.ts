import { z } from "zod";

import { BackendError } from "@/lib/api/transport";
import { hasSiteAccess } from "@/lib/site-gate";

/** Mirrors the backend's run id check: a run id is a uuid. */
const RunId = z.uuid();

const SIGNED_OUT = { error: "Signed out. Reload the page to sign in." };

/**
 * What a failed backend call means to the person looking at the page. A 401 is
 * not an outage: it means this frontend's API_SHARED_SECRET is not the one the
 * backend has, and saying "unreachable" sends them looking in the wrong place.
 */
export function backendFailure(what: string, error: unknown): Response {
  console.error(`[api] ${what} failed:`, error);
  if (error instanceof BackendError && error.status === 401) {
    return Response.json(
      { error: "The backend refused this frontend's key: API_SHARED_SECRET differs between frontend/.env.local and backend/.env." },
      { status: 502 },
    );
  }
  return Response.json({ error: "Could not reach the backend." }, { status: 503 });
}

/** A read passed through to the backend so the shared secret stays on the server. Signed out is a JSON 401. */
export async function gatedRead(what: string, read: () => Promise<unknown>): Promise<Response> {
  if (!(await hasSiteAccess())) return Response.json(SIGNED_OUT, { status: 401 });
  try {
    return Response.json(await read());
  } catch (error) {
    return backendFailure(what, error);
  }
}

/**
 * A read of one run the browser polls. A run id that cannot exist is a 404
 * without asking the backend, and a run the backend does not know is a 404 too.
 */
export async function passThrough(what: string, runId: string, read: () => Promise<unknown>): Promise<Response> {
  if (!(await hasSiteAccess())) return Response.json(SIGNED_OUT, { status: 401 });
  if (!RunId.safeParse(runId).success) return Response.json({ error: "No such run." }, { status: 404 });
  try {
    const body = await read();
    if (body === null) return Response.json({ error: "No such run." }, { status: 404 });
    return Response.json(body);
  } catch (error) {
    if (error instanceof BackendError && error.status === 404) return Response.json({ error: "Not found." }, { status: 404 });
    return backendFailure(what, error);
  }
}

/** A query the page sent that the backend would refuse: answered here as a 400, not passed on and misread as an outage. */
export function badQuery(issues: z.core.$ZodIssue[]): Response {
  const [issue] = issues;
  return Response.json({ error: `Bad query at ${issue?.path.join(".") || "(root)"}: ${issue?.message}` }, { status: 400 });
}
