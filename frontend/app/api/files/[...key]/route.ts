import { fetchFile } from "@/lib/api/files-client";
import { backendFailure } from "@/lib/api-route";
import { hasSiteAccess } from "@/lib/site-gate";

/** Content types worth passing on. Anything else is served as bytes rather than as whatever a caller named. */
const RELAYED = ["content-type", "content-length", "cache-control"];

/**
 * An object from the backend's store, streamed through so the shared secret
 * stays on the server. The body is relayed rather than buffered: a page image
 * or an uploaded PDF has no business sitting in this process's memory.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/files/[...key]">) {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  const { key } = await ctx.params;
  try {
    const upstream = await fetchFile(key.join("/"));
    if (!upstream.ok) return Response.json({ error: "No such file." }, { status: upstream.status === 404 ? 404 : 502 });
    const headers = new Headers();
    for (const name of RELAYED) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { headers });
  } catch (error) {
    return backendFailure("stream a file", error);
  }
}
