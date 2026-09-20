import type { ComparisonField } from "../../contracts";
import type { EvidenceReason } from "../compare";
import type { ShipmentColumn, SightingRole } from "./roles";

/**
 * What one email's reading becomes: a shipment row, its sightings, and what
 * was dropped on the way.
 *
 * Apart from the assembly that produces them, because the writer, the
 * processor and the tests all read these and none of them needs the rules.
 */

export interface SightingDraft {
  role: SightingRole;
  source: "subject" | "body" | "header" | "document";
  surface: string;
  address: string | null;
  sourceQuote: string;
}

export interface ShipmentDraft {
  ocNo: string | null;
  blNo: string | null;
  bookingRef: string | null;
  invoiceNo: string | null;
  poNo: string | null;
  voyage: string | null;
  hsCode: string | null;
  containerCount: number | null;
  containerType: string | null;
  grossWeightKg: number | null;
  tradeTerm: string | null;
  paymentTerm: string | null;
  blType: string | null;
  freight: string | null;
  mailDate: string | null;
  mailDateQuote: string | null;
  disputedFields: ComparisonField[];
  /** What the mail states about the shipment that has no column of its own. */
  attributes: Record<string, string>;
  /** Which surface each entity column should resolve to. The processor turns these into ids. */
  links: { column: ShipmentColumn; surface: string }[];
}

export interface Dropped {
  what: string;
  reason: EvidenceReason;
}

export interface AssembledShipment {
  shipment: ShipmentDraft;
  sightings: SightingDraft[];
  dropped: Dropped[];
}
