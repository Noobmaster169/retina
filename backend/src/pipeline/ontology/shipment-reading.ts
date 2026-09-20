/**
 * The shape `shipment-read` answers in, narrowed to what assembly reads.
 *
 * Declared here in the pure core rather than taken from the agent module,
 * because `pipeline/` may not import an adapter and this is the contract
 * between the two: the agent's zod schema is checked against it where the two
 * meet, and assembling is written against this alone.
 */

/** The shape this reads, which is `ShipmentReadOutput` narrowed to what assembly needs. */
export interface Quoted {
  value: string;
  source_quote: string;
  source: "subject" | "body" | "header" | "document";
}
export interface QuotedNumber {
  value: number;
  source_quote: string;
  source: "subject" | "body" | "header" | "document";
}
export interface ShipmentReading {
  references: { oc_no: Quoted | null; bl_no: Quoted | null; booking_ref: Quoted | null; invoice_no: Quoted | null; po_no: Quoted | null };
  parties: { role: "shipper" | "on_behalf_of" | "consignee" | "notify_party"; name: string; address: string | null; source_quote: string; source: Quoted["source"] }[];
  ports: { port_of_loading: Quoted | null; port_of_discharge: Quoted | null };
  carrier: Quoted | null;
  vessel: Quoted | null;
  voyage: Quoted | null;
  goods: Quoted | null;
  hs_code: Quoted | null;
  container_count: QuotedNumber | null;
  container_type: Quoted | null;
  gross_weight_kg: QuotedNumber | null;
  trade_term: Quoted | null;
  payment_term: Quoted | null;
  bl_type: Quoted | null;
  freight: Quoted | null;
  mail_date: { value: string; source_quote: string; source: Quoted["source"] } | null;
  people: { sighting: "sender" | "signer" | "addressee"; name: string | null; email: string | null; company: string | null; title: string | null; source_quote: string; source: Quoted["source"] }[];
}
