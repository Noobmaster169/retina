import {
  EntityDetail,
  EntityList,
  ObjectGraph,
  ObjectRecord,
  type ObjectType,
  ObjectTypeList,
  type ObjectTypeSummary,
} from "./ontology-schemas";
import { get } from "./transport";

export type {
  EntityAppearance,
  EntityDetail,
  EntityList,
  EntityName,
  EntityRow,
  GraphEdge,
  GraphNode,
  ObjectGraph,
  ObjectLink,
  ObjectRecord,
  ObjectType,
  ObjectTypeSummary,
  StoredValue,
  WrittenBy,
} from "./ontology-schemas";
export type { AttributeSource, EntityKind, SemanticReading, StoredProfile } from "./semantic-schemas";

/** The rail on both the database page and the ontology page, with live counts. */
export async function listObjectTypes(): Promise<ObjectTypeSummary[]> {
  return (await get(ObjectTypeList, "/ontology/types")).types;
}

/**
 * The resolved things of one kind. Only `port` and `party` have an index of
 * their own; everything else is a table and is read through the database page.
 */
export async function listEntities(type: "port" | "party"): Promise<EntityList> {
  return get(EntityList, `/ontology/${type}`);
}

/** Null for an id nothing holds, and for a type that is designed and not built. */
export async function getObjectRecord(
  type: ObjectType,
  id: string,
  runId?: string,
): Promise<ObjectRecord | null> {
  const query = runId ? `?runId=${encodeURIComponent(runId)}` : "";
  return orNull(get(ObjectRecord, `/ontology/${type}/${encodeURIComponent(id)}${query}`));
}

/** The four parts a resolved thing opens into. */
export async function getEntityDetail(type: "port" | "party", id: string): Promise<EntityDetail | null> {
  return orNull(get(EntityDetail, `/ontology/${type}/${encodeURIComponent(id)}/detail`));
}

/** One email, one or two hops out, as nodes and named edges. Carries no coordinates: the layout is ours. */
export async function getObjectGraph(id: string, runId: string, hops: 1 | 2 = 1): Promise<ObjectGraph | null> {
  return orNull(get(ObjectGraph, `/ontology/email/${encodeURIComponent(id)}/graph?runId=${encodeURIComponent(runId)}&hops=${hops}`));
}

/**
 * A 404 is an answer here, not a failure: a planned type and an id nobody
 * holds are both "there is nothing to draw", and the page says so in its own
 * words. Anything else still throws, because a 500 is not an empty page.
 */
async function orNull<T>(reading: Promise<T>): Promise<T | null> {
  try {
    return await reading;
  } catch (error) {
    if (error instanceof Error && /→ 404$/.test(error.message)) return null;
    throw error;
  }
}
