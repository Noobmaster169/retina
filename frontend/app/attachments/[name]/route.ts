import { fetchAttachment } from "@/lib/api-client";

const NAME = /^[\w.-]{1,128}$/;

/** Streams one attachment from the backend so the shared secret stays server-side. */
export async function GET(_req: Request, ctx: RouteContext<"/attachments/[name]">) {
  const { name } = await ctx.params;
  if (!NAME.test(name)) return new Response("Bad attachment name", { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetchAttachment(name);
  } catch {
    return new Response("The inbox is not reachable right now.", { status: 503 });
  }
  if (!upstream.ok) return new Response("No such attachment", { status: upstream.status === 404 ? 404 : 502 });

  const headers = new Headers({ "content-disposition": `attachment; filename="${name}"` });
  for (const h of ["content-type", "content-length"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: 200, headers });
}
