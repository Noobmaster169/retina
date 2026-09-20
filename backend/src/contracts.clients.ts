import { z } from "zod";

/**
 * The senders the queue orders by, as the /clients page reads and writes them.
 *
 * Re-exported from contracts.ts; mirrored by hand in
 * frontend/lib/api/clients-schemas.ts.
 *
 * A tier orders a queue and nothing else. None of these values reaches a
 * prompt, and `kind` in particular decides no category: it is a label a person
 * puts on a sender so the page reads sensibly. The model classifies every
 * email, and no row here overrides it.
 */

/** What this sender is to us. `spam` is a label a person sets, never one the pipeline infers. */
export const ClientKind = z.enum(["customer", "internal", "forwarder", "spam"]);
export type ClientKind = z.infer<typeof ClientKind>;

/** 1 is served first, 5 last. Matches the check constraint on core.clients. */
export const ClientTier = z.number().int().min(1).max(5);

/** What a sender nobody has ranked is worth: the middle of the range, and the tier the seed gives everyone. */
export const DEFAULT_TIER = 3;

export const ClientRow = z.object({
  domain: z.string(),
  /** Null for a sender nobody has named. The page shows the domain then. */
  name: z.string().nullable(),
  tier: ClientTier,
  kind: ClientKind,
  /**
   * False for a domain that has only ever been seen in an email, with no row
   * in core.clients. Its tier and kind are the defaults, and the page says so
   * rather than implying someone chose them.
   */
  known: z.boolean(),
  /** How many distinct emails this domain has sent, across every run. */
  emails: z.number().int(),
  /** How many of those ended in a comparison the pipeline called MISMATCH. */
  mismatches: z.number().int(),
});
export type ClientRow = z.infer<typeof ClientRow>;

export const ClientList = z.object({ clients: z.array(ClientRow) });
export type ClientList = z.infer<typeof ClientList>;

/** The body of PUT /clients/:domain. Every field optional: a tier change must not clear a name. */
export const ClientUpdate = z
  .object({
    name: z.string().max(200).nullable().optional(),
    tier: ClientTier.optional(),
    kind: ClientKind.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "name, tier or kind" });
export type ClientUpdate = z.infer<typeof ClientUpdate>;
