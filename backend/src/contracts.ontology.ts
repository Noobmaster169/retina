import { z } from "zod";

/**
 * The model as a model: object types, one object's stored values, the links
 * out of it, and the spellings that were judged into it.
 *
 * Re-exported from contracts.ts; mirrored by hand in
 * frontend/lib/api/ontology-schemas.ts.
 *
 * One shape serves every type. An Email and a Port are read from different
 * tables and mean different things, but a reader wants the same four questions
 * answered about either: what is stored, who wrote each value, what it links
 * to, and where it has been seen. A second shape per type would be four more
 * components saying the same thing in different words.
 */

/**
 * The types the ontology navigates.
 *
 * Most are tables the pipeline writes. `port` and `party` are resolved from
 * what the extractor read and what the field judge accepted. `shipment` and
 * `carrier` are named here and are never `built`: nothing in the organisers'
 * seven fields yields a booking or a vessel, so they have no source. They are
 * in the enum so the rail can draw them dashed and say so, which is what
 * docs/design/ontology-patterns.md section 0 asks for and is more honest than
 * leaving a designed part of the model off the page.
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
]);
export type ObjectType = z.infer<typeof ObjectType>;

/** How a value is drawn: the badge in front of it on the Record tab. */
export const ValueType = z.enum(["abc", "123", "1.0", "date", "enum", "list", "pk", "fx", "n", "ts"]);
export type ValueType = z.infer<typeof ValueType>;

/**
 * Who put this value here. The whole point of the column: a reader can see at
 * a glance which of an object's values the sender supplied, which a model
 * decided, and which the code derived from the other two.
 */
export const WrittenBy = z.enum(["the source", "a model", "code", "a person", "nothing wrote it"]);
export type WrittenBy = z.infer<typeof WrittenBy>;

/** One type in the rail, with its live count and whether it has a table behind it yet. */
export const ObjectTypeSummary = z.object({
  type: ObjectType,
  label: z.string(),
  /** The table it reads, or null for a type resolved rather than stored. */
  table: z.string().nullable(),
  count: z.number().int(),
  /** False for a type the design names and the schema does not hold. Drawn dashed. */
  built: z.boolean(),
});
export type ObjectTypeSummary = z.infer<typeof ObjectTypeSummary>;

export const ObjectTypeList = z.object({ types: z.array(ObjectTypeSummary) });
export type ObjectTypeList = z.infer<typeof ObjectTypeList>;

export const StoredValue = z.object({
  key: z.string(),
  valueType: ValueType,
  /** Null where nothing wrote it. The page greys the row rather than hiding it. */
  value: z.string().nullable(),
  writtenBy: WrittenBy,
  /** Set where the value carries a verdict's colour: a MISMATCH, a defect field. */
  tone: z.enum(["differ", "review", "match", "fault"]).nullable(),
});
export type StoredValue = z.infer<typeof StoredValue>;

/**
 * One link out of an object, and how many things are at the other end.
 *
 * `derived` marks the two or three hand-chosen traversals per type that are
 * not a foreign key: `Same client, differed` is
 * email -> client -> emails -> comparisons where has_defect. Those are the
 * rows that make this a knowledge tool rather than a schema browser, and
 * docs/design/ontology-patterns.md section 2.6 caps them at three.
 */
export const ObjectLink = z.object({
  key: z.string(),
  label: z.string(),
  /** One line on what is at the other end, in the words the design uses. */
  sub: z.string().nullable(),
  count: z.number().int(),
  /** Where clicking leads, or null for a link with nothing at the other end. */
  target: z.object({ type: ObjectType, id: z.string() }).nullable(),
  targetType: ObjectType.nullable(),
  derived: z.boolean(),
  tone: z.enum(["differ", "review", "match"]).nullable(),
});
export type ObjectLink = z.infer<typeof ObjectLink>;

/** The Record tab: everything about one object except its picture. */
export const ObjectRecord = z.object({
  type: ObjectType,
  id: z.string(),
  title: z.string(),
  /** One sentence on what this kind of thing is, in the present tense. */
  blurb: z.string(),
  /** Chips beside the title: the type, and a verdict where the object carries one. */
  badges: z.array(z.object({ label: z.string(), tone: z.enum(["neutral", "differ", "review", "match", "ink"]) })),
  values: z.array(StoredValue),
  links: z.array(ObjectLink),
  /** Where this object lives outside the ontology, so a reader can leave for the real page. */
  openHref: z.string().nullable(),
});
export type ObjectRecord = z.infer<typeof ObjectRecord>;

/**
 * The Links tab: the same object one hop out, as nodes and named edges.
 *
 * Positions are not here. The layout is computed in the frontend by
 * `lib/graph/layout.ts` so it is one pure function with a table-driven test,
 * and so the same graph can be laid out again at a different width without
 * another round trip. What the backend states is the fact: which things are
 * around this one and what each link is called.
 */
export const GraphNode = z.object({
  id: z.string(),
  type: ObjectType,
  label: z.string(),
  sub: z.string(),
  /** The one the graph is about. Exactly one node carries it. */
  focal: z.boolean(),
  tone: z.enum(["neutral", "differ", "review", "match"]),
});
export type GraphNode = z.infer<typeof GraphNode>;

export const GraphEdge = z.object({
  from: z.string(),
  to: z.string(),
  /** Drawn on the edge: `sent it`, `is about`, `carries`, `judged into`, `found`. */
  label: z.string(),
  tone: z.enum(["neutral", "differ"]),
});
export type GraphEdge = z.infer<typeof GraphEdge>;

export const ObjectGraph = z.object({
  focus: z.object({ type: ObjectType, id: z.string() }),
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
  /** How many hops out this graph reaches. The header's `Two hops` control asks for 2. */
  hops: z.number().int(),
});
export type ObjectGraph = z.infer<typeof ObjectGraph>;

/** One spelling that was judged into a resolved thing. The `written these ways` list. */
export const EntityName = z.object({
  value: z.string(),
  seenCount: z.number().int(),
  joinedBy: z.enum(["kept", "judge", "human"]),
  confidence: z.number().nullable(),
});
export type EntityName = z.infer<typeof EntityName>;

/**
 * One email a resolved thing was read out of, and how that email ended.
 *
 * One row per email and field, not per mention. A port read from both the
 * instruction and the draft of one email is one appearance read twice, and the
 * same email replayed in three runs is still one appearance; listing each
 * mention put the same subject on screen three times over and told a reader
 * nothing the `sides` and the count do not.
 */
export const EntityAppearance = z.object({
  emailId: z.string(),
  /** The most recent run that saw it. Its comparison is the outcome shown. */
  runId: z.string(),
  subject: z.string(),
  field: z.string(),
  value: z.string(),
  /** Which documents of that email it was read from. Both, for a value that agreed. */
  sides: z.array(z.enum(["SI", "BL"])),
  seenAt: z.string(),
  /** The comparison's status, or null where the email never reached one. */
  outcome: z.string().nullable(),
});
export type EntityAppearance = z.infer<typeof EntityAppearance>;

/** One row of the `As things` list: a resolved thing before it is opened. */
export const EntityRow = z.object({
  id: z.string(),
  type: ObjectType,
  name: z.string(),
  mentions: z.number().int(),
  emails: z.number().int(),
  names: z.number().int(),
  lastSeen: z.string().nullable(),
});
export type EntityRow = z.infer<typeof EntityRow>;

export const EntityList = z.object({ type: ObjectType, built: z.boolean(), entities: z.array(EntityRow) });
export type EntityList = z.infer<typeof EntityList>;

/** The four parts a row opens into, and what the full record page draws. */
export const EntityDetail = z.object({
  row: EntityRow,
  values: z.array(StoredValue),
  links: z.array(ObjectLink),
  names: z.array(EntityName),
  appearances: z.array(EntityAppearance),
  /** How many appearances exist, when `appearances` is the last few of them. */
  appearanceCount: z.number().int(),
});
export type EntityDetail = z.infer<typeof EntityDetail>;
