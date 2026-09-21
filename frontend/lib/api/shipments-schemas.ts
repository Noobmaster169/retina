import { z } from "zod";

/**
 * Mirrors backend/src/contracts.shipments.ts by hand. A drift fails here,
 * naming the field, instead of reaching a page as undefined.
 */

export const ShipmentRef = z.object({ id: z.string(), name: z.string() });
export type ShipmentRef = z.infer<typeof ShipmentRef>;

export const ShipmentRow = z.object({
  emailId: z.string(),
  subject: z.string(),
  runId: z.string().nullable(),
  /** The email run's outcome when it has one: OK, MISMATCH, NEEDS_REVIEW, a category, or null. */
  outcome: z.string().nullable(),
  ocNo: z.string().nullable(),
  blNo: z.string().nullable(),
  bookingRef: z.string().nullable(),
  mailDate: z.string().nullable(),
  shipper: ShipmentRef.nullable(),
  consignee: ShipmentRef.nullable(),
  notifyParty: ShipmentRef.nullable(),
  pol: ShipmentRef.nullable(),
  pod: ShipmentRef.nullable(),
  carrier: ShipmentRef.nullable(),
  vessel: ShipmentRef.nullable(),
  commodity: ShipmentRef.nullable(),
  voyage: z.string().nullable(),
  containerCount: z.number().int().nullable(),
  containerType: z.string().nullable(),
  grossWeightKg: z.number().nullable(),
  disputedFields: z.array(z.string()),
});
export type ShipmentRow = z.infer<typeof ShipmentRow>;

export const ShipmentDetail = ShipmentRow.extend({
  invoiceNo: z.string().nullable(),
  poNo: z.string().nullable(),
  hsCode: z.string().nullable(),
  tradeTerm: z.string().nullable(),
  paymentTerm: z.string().nullable(),
  blType: z.string().nullable(),
  freight: z.string().nullable(),
  mailDateQuote: z.string().nullable(),
  /** What the mail states beyond the columns, as shipment-read wrote it. */
  attributes: z.record(z.string(), z.string()),
  /** The email page, where the case and its documents are. Null when the run that read it is gone. */
  caseHref: z.string().nullable(),
});
export type ShipmentDetail = z.infer<typeof ShipmentDetail>;

export const ShipmentList = z.object({ shipments: z.array(ShipmentRow), total: z.number().int() });
export type ShipmentList = z.infer<typeof ShipmentList>;

/** What a list page may ask for. The frontend builds it from typed values, so nothing is coerced here. */
export const ShipmentQuery = z.object({
  partyId: z.string().regex(/^\d+$/).optional(),
  portId: z.string().regex(/^\d+$/).optional(),
  disputed: z.enum(["true", "false"]).optional(),
  q: z.string().max(80).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
});
export type ShipmentQuery = z.infer<typeof ShipmentQuery>;
