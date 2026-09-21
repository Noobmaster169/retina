import { z } from "zod";

import { EntityInsight } from "./insight-schemas";
import { StoredProfile } from "./semantic-schemas";

/**
 * Mirrors backend/src/contracts.ontology.ts by hand. A drift fails here,
 * naming the field, instead of reaching the ontology page as undefined.
 */

export const ObjectType = z.enum([
  "run",
  "email",
  "attachment",
  "document",
  "comparison",
  "difference",
  "field",
  "client",
  "port",
  "party",
  "shipment",
  "carrier",
  "person",
  "commodity",
  "vessel",
]);
export type ObjectType = z.infer<typeof ObjectType>;

export const ValueType = z.enum(["abc", "123", "1.0", "date", "enum", "list", "pk", "fx", "n", "ts"]);
export type ValueType = z.infer<typeof ValueType>;

export const WrittenBy = z.enum(["the source", "a model", "code", "a person", "nothing wrote it"]);
export type WrittenBy = z.infer<typeof WrittenBy>;

export const ObjectTypeSummary = z.object({
  type: ObjectType,
  label: z.string(),
  table: z.string().nullable(),
  count: z.number().int(),
  /** False for a type the design names and the schema does not hold. The rail draws it dashed. */
  built: z.boolean(),
});
export type ObjectTypeSummary = z.infer<typeof ObjectTypeSummary>;

export const ObjectTypeList = z.object({ types: z.array(ObjectTypeSummary) });

const Tone = z.enum(["differ", "review", "match", "fault"]);

export const StoredValue = z.object({
  key: z.string(),
  valueType: ValueType,
  value: z.string().nullable(),
  writtenBy: WrittenBy,
  tone: Tone.nullable(),
});
export type StoredValue = z.infer<typeof StoredValue>;

export const ObjectLink = z.object({
  key: z.string(),
  label: z.string(),
  sub: z.string().nullable(),
  count: z.number().int(),
  target: z.object({ type: ObjectType, id: z.string() }).nullable(),
  targetType: ObjectType.nullable(),
  /** A hand-chosen traversal rather than a foreign key. Drawn quieter, and the sub says so. */
  derived: z.boolean(),
  tone: z.enum(["differ", "review", "match"]).nullable(),
});
export type ObjectLink = z.infer<typeof ObjectLink>;

export const ObjectRecord = z.object({
  type: ObjectType,
  id: z.string(),
  title: z.string(),
  blurb: z.string(),
  badges: z.array(z.object({ label: z.string(), tone: z.enum(["neutral", "differ", "review", "match", "ink"]) })),
  values: z.array(StoredValue),
  links: z.array(ObjectLink),
  openHref: z.string().nullable(),
});
export type ObjectRecord = z.infer<typeof ObjectRecord>;

export const GraphNode = z.object({
  id: z.string(),
  type: ObjectType,
  label: z.string(),
  sub: z.string(),
  focal: z.boolean(),
  tone: z.enum(["neutral", "differ", "review", "match"]),
});
export type GraphNode = z.infer<typeof GraphNode>;

export const GraphEdge = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string(),
  tone: z.enum(["neutral", "differ"]),
});
export type GraphEdge = z.infer<typeof GraphEdge>;

export const ObjectGraph = z.object({
  focus: z.object({ type: ObjectType, id: z.string() }),
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
  hops: z.number().int(),
});
export type ObjectGraph = z.infer<typeof ObjectGraph>;

export const EntityName = z.object({
  value: z.string(),
  seenCount: z.number().int(),
  /** How this spelling joined. Nothing but a judge verdict or a person ever joins one. */
  joinedBy: z.enum(["kept", "judge", "human"]),
  confidence: z.number().nullable(),
});
export type EntityName = z.infer<typeof EntityName>;

/** One email, not one mention: both documents of one email are one appearance read twice. */
export const EntityAppearance = z.object({
  emailId: z.string(),
  runId: z.string(),
  subject: z.string(),
  field: z.string(),
  value: z.string(),
  sides: z.array(z.enum(["SI", "BL"])),
  seenAt: z.string(),
  outcome: z.string().nullable(),
});
export type EntityAppearance = z.infer<typeof EntityAppearance>;

export const EntityRow = z.object({
  id: z.string(),
  type: ObjectType,
  name: z.string(),
  /** Times it was read out of one of the seven fields of a document. */
  mentions: z.number().int(),
  /** Times it was read somewhere no extraction field reaches: a subject, a body, a header. */
  sightings: z.number().int(),
  emails: z.number().int(),
  names: z.number().int(),
  lastSeen: z.string().nullable(),
});
export type EntityRow = z.infer<typeof EntityRow>;

export const EntityList = z.object({ type: ObjectType, built: z.boolean(), entities: z.array(EntityRow) });
export type EntityList = z.infer<typeof EntityList>;

export const EntityDetail = z.object({
  row: EntityRow,
  /** What this thing is. Null until the profile job has written one. */
  profile: StoredProfile.nullable().default(null),
  /** What it means: the same dossier the profile was written from, as facets a page can draw. */
  insight: EntityInsight,
  values: z.array(StoredValue),
  links: z.array(ObjectLink),
  names: z.array(EntityName),
  appearances: z.array(EntityAppearance),
  appearanceCount: z.number().int(),
});
export type EntityDetail = z.infer<typeof EntityDetail>;
