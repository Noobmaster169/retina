import { z } from "zod";

import { ComparisonField } from "./contracts.scoring";
import { EntityKind } from "./contracts.semantic";

/**
 * A consignment: the thing a mail is about, rather than the mail.
 *
 * Re-exported from contracts.ts; mirrored by hand in
 * frontend/lib/api/shipment-schemas.ts.
 *
 * One row per group of emails sharing an identifier. Today every group holds
 * one email, because the inbox as generated draws fresh references per mail.
 * The shape says `emails` either way, so a page that reads it does not have to
 * change when a real thread arrives.
 *
 * Named Consignment in code because `Shipment` is taken by contracts.shipments.ts:
 * one shipment as one email states it, which the business pages read.
 */

/** A number the paperwork is filed under, with the kind of number it is. */
export const ConsignmentRef = z.object({ key: z.string(), label: z.string(), value: z.string() });
export type ConsignmentRef = z.infer<typeof ConsignmentRef>;

/** One resolved thing on a shipment, in the role it plays there. */
export const ConsignmentParty = z.object({
  role: z.string(),
  kind: EntityKind,
  id: z.string(),
  name: z.string(),
  /** True where the field judge said the two documents did not agree on this value. */
  disputed: z.boolean(),
});
export type ConsignmentParty = z.infer<typeof ConsignmentParty>;

/** A shipment as the list draws it: enough to tell two apart without opening either. */
export const ConsignmentRow = z.object({
  id: z.string(),
  refs: z.array(ConsignmentRef),
  lane: z.object({ from: z.string(), to: z.string() }).nullable(),
  consignee: z.string().nullable(),
  commodity: z.string().nullable(),
  emails: z.number().int(),
  lastMailDate: z.string().nullable(),
  disputedFields: z.array(ComparisonField),
});
export type ConsignmentRow = z.infer<typeof ConsignmentRow>;

export const ConsignmentList = z.object({ shipments: z.array(ConsignmentRow), total: z.number().int() });
export type ConsignmentList = z.infer<typeof ConsignmentList>;

/** What one email states about the shipment, with the line each value was read from. */
export const ConsignmentStatement = z.object({
  emailId: z.string(),
  subject: z.string(),
  mailDate: z.string().nullable(),
  mailDateQuote: z.string().nullable(),
  /** Everything the shipment reader returned that has no column of its own, as written. */
  attributes: z.record(z.string(), z.string()),
  voyage: z.string().nullable(),
  hsCode: z.string().nullable(),
  containerCount: z.number().nullable(),
  grossWeightKg: z.number().nullable(),
  tradeTerm: z.string().nullable(),
  paymentTerm: z.string().nullable(),
  blType: z.string().nullable(),
  freight: z.string().nullable(),
  disputedFields: z.array(ComparisonField),
});
export type ConsignmentStatement = z.infer<typeof ConsignmentStatement>;

/** One consignment, opened. */
export const ConsignmentDetail = z.object({
  row: ConsignmentRow,
  /** Shipper, on behalf of, consignee, notify, both ports, carrier, vessel and commodity, in that order. */
  parties: z.array(ConsignmentParty),
  /** One per email of the group, newest first. */
  statements: z.array(ConsignmentStatement),
});
export type ConsignmentDetail = z.infer<typeof ConsignmentDetail>;
