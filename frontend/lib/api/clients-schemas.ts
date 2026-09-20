import { z } from "zod";

/**
 * Mirrors backend/src/contracts.clients.ts by hand. A drift fails here, naming
 * the field, instead of reaching the clients page as undefined.
 */

export const ClientKind = z.enum(["customer", "internal", "forwarder", "spam"]);
export type ClientKind = z.infer<typeof ClientKind>;

export const ClientTier = z.number().int().min(1).max(5);

export const ClientRow = z.object({
  domain: z.string(),
  name: z.string().nullable(),
  tier: ClientTier,
  kind: ClientKind,
  /** False for a sender with no row of its own: the tier and kind shown are defaults nobody chose. */
  known: z.boolean(),
  emails: z.number().int(),
  mismatches: z.number().int(),
});
export type ClientRow = z.infer<typeof ClientRow>;

export const ClientList = z.object({ clients: z.array(ClientRow) });
export type ClientList = z.infer<typeof ClientList>;

/** Mirrors the api's own refusal of an empty patch, so it fails here rather than coming back a 400. */
export const ClientUpdate = z
  .object({
    name: z.string().max(200).nullable().optional(),
    tier: ClientTier.optional(),
    kind: ClientKind.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "name, tier or kind" });
export type ClientUpdate = z.infer<typeof ClientUpdate>;
