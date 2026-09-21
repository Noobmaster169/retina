import { EntityRow } from "./ontology-schemas";
import type { EntityKind } from "./semantic-schemas";
import { parseAs, refusalMessage, request } from "./transport";

/**
 * A person correcting a thing from its page. Each write names who made it,
 * and comes back as the row the pages read, or the reason it was refused in
 * the backend's own words with its status, which the page shows as it is.
 */

export type EditOutcome = { ok: true; row: EntityRow } | { ok: false; status: number; message: string };

async function write(path: string, method: "PATCH" | "POST", body: unknown): Promise<EditOutcome> {
  const response = await request(path, { method, body: JSON.stringify(body) });
  if (!response.ok) return { ok: false, status: response.status, message: await refusalMessage(response) };
  return { ok: true, row: await parseAs(EntityRow, response, `${method} ${path}`) };
}

export function editAttributes(kind: EntityKind, id: string, actor: string, attributes: Record<string, string | null>): Promise<EditOutcome> {
  return write(`/ontology/${kind}/${encodeURIComponent(id)}/attributes`, "PATCH", { actor, attributes });
}

export function renameEntity(kind: EntityKind, id: string, actor: string, name: string): Promise<EditOutcome> {
  return write(`/ontology/${kind}/${encodeURIComponent(id)}/rename`, "POST", { actor, name });
}

/** Folds `id` into `into`; the row that comes back is the survivor. */
export function mergeEntity(kind: EntityKind, id: string, actor: string, into: string): Promise<EditOutcome> {
  return write(`/ontology/${kind}/${encodeURIComponent(id)}/merge`, "POST", { actor, into });
}
