import { z } from "zod";

import { EntityKind } from "./semantic-schemas";

/**
 * Mirrors backend/src/contracts.insight.ts; change both or neither. No
 * transport here, so a client component may import these.
 *
 * What a thing means, as opposed to what holds it. Every number comes from the
 * same bounded queries the profile prompt is built from: one dossier, two
 * readers.
 */

export const InsightLine = z.object({
  label: z.string(),
  detail: z.string().nullable(),
  count: z.number().int().nullable(),
  unit: z.string().nullable(),
  target: z.object({ kind: EntityKind, id: z.string() }).nullable(),
  tone: z.enum(["neutral", "differ", "match"]),
});
export type InsightLine = z.infer<typeof InsightLine>;

export const InsightFacet = z.object({
  key: z.string(),
  heading: z.string(),
  /** The sentence that turns two counts into a relationship. */
  note: z.string().nullable(),
  lines: z.array(InsightLine),
  total: z.number().int(),
});
export type InsightFacet = z.infer<typeof InsightFacet>;

/** `verified` false is what the model knows rather than what our mail shows. */
export const IdentityFact = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  verified: z.boolean(),
  confidence: z.number().nullable(),
});
export type IdentityFact = z.infer<typeof IdentityFact>;

export const EntityInsight = z.object({
  kind: EntityKind,
  summary: z.string().nullable(),
  identity: z.array(IdentityFact),
  scale: z.object({
    emails: z.number().int(),
    appearances: z.number().int(),
    spellings: z.number().int(),
    disputed: z.number().int(),
    firstMailDate: z.string().nullable(),
    lastMailDate: z.string().nullable(),
  }),
  facets: z.array(InsightFacet),
  unknowns: z.array(z.string()),
});
export type EntityInsight = z.infer<typeof EntityInsight>;
