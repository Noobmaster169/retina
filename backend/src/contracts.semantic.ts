import { z } from "zod";

/**
 * What a thing is, beyond the spellings it was read under.
 *
 * Re-exported from contracts.ts; mirrored by hand in
 * frontend/lib/api/ontology-schemas.ts.
 *
 * Two rules hold everything here together. Attributes are a closed schema per
 * kind, because a question asks a total over them and a free-text key cannot
 * be counted. Knowledge is labelled: `observed` is only what our mail shows,
 * `general` is what the model knows from training and is never a claim about
 * this mailbox.
 */

export const EntityKind = z.enum(["port", "party", "carrier", "person", "commodity", "vessel"]);
export type EntityKind = z.infer<typeof EntityKind>;

/**
 * The UN geoscheme, value for value, because totals are asked over these.
 *
 * Closed rather than free text for the same reason the organisers' enums are:
 * "how much to Asia" is only answerable when every port either is in Asia or
 * is not, and a model that may invent a region name makes "Asia", "asia" and
 * "East Asia" three answers to one question. The model assigns them; there is
 * no country-to-region table anywhere in this system.
 */
export const Region = z.enum(["Africa", "Americas", "Asia", "Europe", "Oceania"]);
export type Region = z.infer<typeof Region>;

export const Subregion = z.enum([
  "Northern Africa", "Eastern Africa", "Middle Africa", "Southern Africa", "Western Africa",
  "Caribbean", "Central America", "South America", "Northern America",
  "Central Asia", "Eastern Asia", "South-eastern Asia", "Southern Asia", "Western Asia",
  "Eastern Europe", "Northern Europe", "Southern Europe", "Western Europe",
  "Australia and New Zealand", "Melanesia", "Micronesia", "Polynesia",
]);
export type Subregion = z.infer<typeof Subregion>;

const text = (max: number) => z.string().min(1).max(max).nullable();

export const PortAttributes = z.object({
  country: text(80),
  region: Region.nullable(),
  subregion: Subregion.nullable(),
  /** The UN/LOCODE, where the model is sure of it. Never matched on alone: a code on a document can name another port. */
  locode: text(10),
  coast: text(60),
});
export type PortAttributes = z.infer<typeof PortAttributes>;

export const PartyAttributes = z.object({
  country: text(80),
  city: text(80),
  /** What it does in the trade, in the model's own words: a mill, a converter, a distributor, a forwarder. */
  kind: text(40),
  sector: text(60),
  /** The group it belongs to, where several spellings are companies of one parent. */
  group: text(120),
});
export type PartyAttributes = z.infer<typeof PartyAttributes>;

export const CarrierAttributes = z.object({
  fullName: text(160),
  scac: text(10),
  kind: text(40),
});
export type CarrierAttributes = z.infer<typeof CarrierAttributes>;

export const CommodityAttributes = z.object({
  family: text(80),
  /** Two digits. Everything this mailbox carries is chapter 48; nothing assumes that. */
  hsChapter: z.string().regex(/^\d{2}$/).nullable(),
  use: text(120),
});
export type CommodityAttributes = z.infer<typeof CommodityAttributes>;

export const PersonAttributes = z.object({
  company: text(160),
  title: text(80),
  team: text(80),
});
export type PersonAttributes = z.infer<typeof PersonAttributes>;

export const VesselAttributes = z.object({ operator: text(160) });
export type VesselAttributes = z.infer<typeof VesselAttributes>;

export const ATTRIBUTES: Record<EntityKind, z.ZodType> = {
  port: PortAttributes,
  party: PartyAttributes,
  carrier: CarrierAttributes,
  person: PersonAttributes,
  commodity: CommodityAttributes,
  vessel: VesselAttributes,
};

/**
 * Where one attribute came from, key for key with the attributes themselves.
 *
 * `mail` means the dossier in front of the model carried it: an address, a
 * counterparty, a count. `model` means its own knowledge, which is where a
 * region and a carrier's full name come from. The confidence is the model's
 * own on that knowledge, and null for a `mail` basis, where there is no
 * separate number to give: the value is in the dossier or it is not.
 */
export const AttributeSource = z.object({
  source: z.enum(["mail", "model"]),
  confidence: z.number().min(0).max(1).nullable().default(null),
  llmCallId: z.number().int().nullable().default(null),
});
export type AttributeSource = z.infer<typeof AttributeSource>;

/**
 * What a thing is, as the profile step wrote it.
 *
 * `general` is null when `ONTOLOGY_KNOWLEDGE` is `mail`, when the model knows
 * nothing, and always for a person: a person's profile is work facts from the
 * mail, and what a model believes about a named individual is not something
 * this system stores.
 */
export const EntityProfile = z.object({
  /** Two sentences: what a reader should know first. */
  summary: z.string(),
  /** Only what the dossier showed. */
  observed: z.string(),
  /** What the model knows from training, unverified. Marked as such wherever it is shown. */
  general: z.string().nullable(),
  generalConfidence: z.number().min(0).max(1).nullable(),
  /** What the mail does not say and a reader might expect it to. */
  unknowns: z.array(z.string()).default([]),
});
export type EntityProfile = z.infer<typeof EntityProfile>;

/** The profile as the entity page and the chat read it back. */
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
 * One term a turn had to give a meaning to, and how completely it did.
 *
 * On the turn and not only on the answer, so it is still there when the thread
 * is read back. `complete` false is the honest state and the page words the
 * total as a lower bound; the definition is shown so a disagreement about what
 * "Asia" covers surfaces in the answer rather than in the numbers.
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
