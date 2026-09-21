import { revalidateTag } from "next/cache";

import type { EditOutcome } from "@/lib/api-client";
import { BUSINESS } from "@/lib/api/cached";
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
    // The three writes are the only way a resolved thing changes from in here,
    // so this is the one place the reuse in `lib/api/cached.ts` has to end. A
    // rename reaches a list, a card and a counterpart, and a merge reaches the
    // thing it merged away, so the tag is dropped whole rather than by id.
    revalidateTag(BUSINESS, { expire: 0 });
    return Response.json(outcome.row);
  } catch (error) {
    return backendFailure(what, error);
  }
}
