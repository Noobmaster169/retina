import type { EditOutcome } from "@/lib/api-client";
import { backendFailure } from "@/lib/api-route";
import { EntityKind } from "@/lib/api/semantic-schemas";
import { hasSiteAccess } from "@/lib/site-gate";

/** The three write routes under a thing share one shape: gated, the kind checked, the refusal passed through with its status. */
export async function edit(type: string, work: (kind: EntityKind) => Promise<EditOutcome>, what: string): Promise<Response> {
  if (!(await hasSiteAccess())) return Response.json({ error: "Signed out. Reload the page to sign in." }, { status: 401 });
  const kind = EntityKind.safeParse(type);
  if (!kind.success) return Response.json({ error: "No such kind of thing." }, { status: 404 });
  try {
    const outcome = await work(kind.data);
    if (!outcome.ok) return Response.json({ error: outcome.message }, { status: outcome.status });
    return Response.json(outcome.row);
  } catch (error) {
    return backendFailure(what, error);
  }
}
