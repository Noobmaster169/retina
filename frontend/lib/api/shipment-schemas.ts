import { z } from "zod";

import { ComparisonField } from "./runs-schemas";
import { EntityKind } from "./semantic-schemas";

/**
 * Mirrors backend/src/contracts.shipment.ts; change both or neither.
 *
 * A consignment: the thing a mail is about, rather than the mail. One row per
 * group of emails sharing an identifier, which on this inbox is one email
 * each, because the generator draws fresh references per mail.
 */

export const ConsignmentRef = z.object({ key: z.string(), label: z.string(), value: z.string() });
export type ConsignmentRef = z.infer<typeof ConsignmentRef>;

export const ConsignmentParty = z.object({
  role: z.string(),
  kind: EntityKind,
  id: z.string(),
  name: z.string(),
  /** The field judge said the two documents did not agree on this value. */
  disputed: z.boolean(),
});
export type ConsignmentParty = z.infer<typeof ConsignmentParty>;

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

export const ConsignmentStatement = z.object({
  emailId: z.string(),
  subject: z.string(),
  mailDate: z.string().nullable(),
  mailDateQuote: z.string().nullable(),
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

export const ConsignmentDetail = z.object({
  row: ConsignmentRow,
  parties: z.array(ConsignmentParty),
  statements: z.array(ConsignmentStatement),
});
export type ConsignmentDetail = z.infer<typeof ConsignmentDetail>;
