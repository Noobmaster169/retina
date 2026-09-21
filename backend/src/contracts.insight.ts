import { z } from "zod";

import { EntityKind } from "./contracts.semantic";

/**
 * What a thing means, as opposed to what holds it.
 *
 * Re-exported from contracts.ts; mirrored by hand in
 * frontend/lib/api/insight-schemas.ts.
 *
 * Every number here comes from the same bounded queries the profile prompt is
 * built from, because a page and a model disagreeing about what our mail shows
 * would be worse than either being wrong alone. One dossier, two readers.
 *
 * A facet is a list of measured lines under a heading. One shape for all of
 * them, because a port's lanes and a carrier's vessels are the same question
 * asked of different rows: what, how much, and what does it lead to.
 */

/** One measured line of a facet. */
export const InsightLine = z.object({
  /** What it is, in the words the mail used. */
  label: z.string(),
  /** The second line, where the fact needs one: a lane's other end, a voyage's date. */
  detail: z.string().nullable().default(null),
  /** How much of it there is. Null for a line that is a fact rather than a count. */
  count: z.number().int().nullable().default(null),
  /** What `count` counts, singular: "email", "appearance", "voyage". */
  unit: z.string().nullable().default(null),
  /** Where clicking leads, when the line names something the ontology holds. */
  target: z.object({ kind: EntityKind, id: z.string() }).nullable().default(null),
  /** A line the judge called disputed reads differently from one it did not. */
  tone: z.enum(["neutral", "differ", "match"]).default("neutral"),
});
export type InsightLine = z.infer<typeof InsightLine>;

/**
 * One heading and its lines. `note` is the sentence under the heading that says
 * what the reader is looking at, which is where the semantics of a kind live:
 * "shipper four times, consignee once" means customer, and the note says so.
 */
export const InsightFacet = z.object({
  key: z.string(),
  heading: z.string(),
  note: z.string().nullable().default(null),
  lines: z.array(InsightLine),
  /** How many lines exist when `lines` is the first few of them. */
  total: z.number().int(),
});
export type InsightFacet = z.infer<typeof InsightFacet>;

/**
 * One attribute of a thing, ready to draw.
 *
 * `verified` is false for what the model knows and true for what our mail
 * shows, which is `attributeSources[key].source` read for the reader rather
 * than by the reader. A page that dropped the distinction would put a port's
 * region, which no email states, beside its locode, which one does.
 */
export const IdentityFact = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  verified: z.boolean(),
  confidence: z.number().nullable().default(null),
});
export type IdentityFact = z.infer<typeof IdentityFact>;

/** What one resolved thing means here: who it is, how much of it there is, and the facets of its trade. */
export const EntityInsight = z.object({
  kind: EntityKind,
  /** The profile's opening sentences, or null before it has been profiled. */
  summary: z.string().nullable(),
  identity: z.array(IdentityFact),
  /** The counts that belong above every facet: emails, appearances, spellings, and what was disputed. */
  scale: z.object({
    emails: z.number().int(),
    appearances: z.number().int(),
    spellings: z.number().int(),
    /** Appearances the field judge called different. A thing that exists only on a wrong draft shows here. */
    disputed: z.number().int(),
    firstMailDate: z.string().nullable(),
    lastMailDate: z.string().nullable(),
  }),
  facets: z.array(InsightFacet),
  /** What the profile says our mail does not answer. Shown as written. */
  unknowns: z.array(z.string()),
});
export type EntityInsight = z.infer<typeof EntityInsight>;
