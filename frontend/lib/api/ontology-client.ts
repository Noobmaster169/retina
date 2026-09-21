import {
  type Counterpart,
  CounterpartList,
  EntityDetail,
  EntityList,
  EntityRow,
  type Lane,
  LaneList,
  ObjectGraph,
  ObjectRecord,
  type ObjectType,
  ObjectTypeList,
  type ObjectTypeSummary,
} from "./ontology-schemas";
import type { EntityKind } from "./semantic-schemas";
import { ConsignmentDetail, ConsignmentList } from "./shipment-schemas";
import { get } from "./transport";

export type {
  Counterpart,
  EntityAppearance,
  EntityDetail,
  EntityList,
  EntityName,
  EntityRow,
  GraphEdge,
  GraphNode,
  Lane,
  ObjectGraph,
  ObjectLink,
  ObjectRecord,
  ObjectType,
  ObjectTypeSummary,
  StoredValue,
  WrittenBy,
} from "./ontology-schemas";
export type { AttributeSource, EntityKind, SemanticReading, StoredProfile } from "./semantic-schemas";
export type { EntityInsight, IdentityFact, InsightFacet, InsightLine } from "./insight-schemas";
export type {
  ConsignmentDetail,
  ConsignmentList,
  ConsignmentParty,
  ConsignmentRef,
  ConsignmentRow,
  ConsignmentStatement,
} from "./shipment-schemas";

/** The rail on both the database page and the ontology page, with live counts. */
export async function listObjectTypes(): Promise<ObjectTypeSummary[]> {
  return (await get(ObjectTypeList, "/ontology/types")).types;
}

/** The resolved things of one kind, any of the six, each with its attributes, summary and roles. */
export async function listEntities(type: EntityKind): Promise<EntityList> {
  return get(EntityList, `/ontology/${type}`);
}

/** Every lane the shipments state between two ports, busiest first. */
export async function listLanes(): Promise<Lane[]> {
  return (await get(LaneList, "/ontology/lanes")).lanes;
}

export type Beside = "people" | "ports" | "parties";

/** What sits beside a thing: a company's people and ports, a port's companies. */
export async function listCounterparts(type: EntityKind, id: string, beside: Beside): Promise<Counterpart[]> {
  return (await get(CounterpartList, `/ontology/${type}/${encodeURIComponent(id)}/${beside}`)).counterparts;
}

/** The consignments the mail is about, newest first. */
export async function listConsignments(): Promise<ConsignmentList> {
  return get(ConsignmentList, "/ontology/shipment");
}

/** One consignment: its references, the things on it, and what each email said. */
export async function getConsignment(id: string): Promise<ConsignmentDetail | null> {
  return orNull(get(ConsignmentDetail, `/ontology/shipment/${encodeURIComponent(id)}`));
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
export async function getEntityDetail(type: EntityKind, id: string): Promise<EntityDetail | null> {
  return orNull(get(EntityDetail, `/ontology/${type}/${encodeURIComponent(id)}/detail`));
}

/**
 * One resolved thing, small, for the card a chat mention opens on hover.
 *
 * By id alone: a link in an answer carries the id the agent was shown, and the
 * kind comes back on the row rather than having to be known to ask.
 */
export async function getEntityPreview(id: string): Promise<EntityRow | null> {
  return orNull(get(EntityRow, `/ontology/entity/${encodeURIComponent(id)}/preview`));
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
