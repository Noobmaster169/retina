import { hasSiteAccess } from "@/lib/site-gate";

/**
 * A read the browser polls, passed through to the backend so the shared
 * secret stays on the server. Signed out is a JSON 401, never the login page,
 * and a backend failure is a 503 the poller can show.
 */
export async function passThrough(what: string, read: () => Promise<unknown>): Promise<Response> {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  try {
    const body = await read();
    if (body === null) return Response.json({ error: "No such run." }, { status: 404 });
    return Response.json(body);
  } catch (error) {
    console.error(`[api] ${what} failed:`, error);
    return Response.json({ error: "Could not reach the backend." }, { status: 503 });
  }
}
