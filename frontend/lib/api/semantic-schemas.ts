import { z } from "zod";

/**
 * Mirrors backend/src/contracts.semantic.ts by hand. A drift fails here,
 * naming the field, instead of reaching a component as undefined.
 */

export const EntityKind = z.enum(["port", "party", "carrier", "person", "commodity", "vessel"]);
export type EntityKind = z.infer<typeof EntityKind>;

/** Where one attribute came from. `model` is the model's own knowledge and is drawn as unverified. */
export const AttributeSource = z.object({
  source: z.enum(["mail", "model"]),
  /** Null for a `mail` basis: the value is in the dossier or it is not, and there is no separate number to give. */
  confidence: z.number().nullable().default(null),
  llmCallId: z.number().int().nullable().default(null),
});
export type AttributeSource = z.infer<typeof AttributeSource>;

/** What a thing is, as the profile step wrote it. Null on the detail until it has been profiled once. */
export const StoredProfile = z.object({
  markdown: z.string().nullable(),
  version: z.number().int(),
  updatedAt: z.string().nullable(),
  stale: z.boolean(),
  attributes: z.record(z.string(), z.string().nullable()),
  attributeSources: z.record(z.string(), AttributeSource),
});
export type StoredProfile = z.infer<typeof StoredProfile>;

/**
 * One term a turn had to give a meaning to.
 *
 * `complete` false is the honest state: the reading line says how many were
 * judged and how many are still unjudged, and a total over the term is worded
 * as a lower bound.
 */
export const SemanticReading = z.object({
  conceptId: z.string(),
  phrase: z.string(),
  definition: z.string(),
  entityKind: EntityKind,
  matched: z.number().int(),
  judged: z.number().int(),
  reused: z.number().int(),
  unknown: z.number().int(),
  deferred: z.number().int(),
  complete: z.boolean(),
});
export type SemanticReading = z.infer<typeof SemanticReading>;
