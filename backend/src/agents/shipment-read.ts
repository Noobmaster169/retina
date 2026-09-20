import { z } from "zod";

import { type CallIds, WORKER_PROJECT } from "./classify";
import type { Prompt } from "./prompts/registry";
import { callStructured, type StructuredDeps, type StructuredResult } from "./structured";

/**
 * What one email states about its shipment, in its own words.
 *
 * The seven scored fields are read from the two documents by the extractor and
 * are not this step's business. This reads what the mail says everywhere else:
 * the subject's codes, the prose of a request that carries a whole shipment
 * and has no attachment at all, the parts of a document that are not one of
 * the seven, and the people who wrote and were written to.
 *
 * Nothing here is scored. It runs after an email's verdict is written and can
 * neither change it nor delay it.
 */

/** Where in the email a value was read. A quote is checked against the text of that source. */
export const ReadSource = z.enum(["subject", "body", "header", "document"]);
export type ReadSource = z.infer<typeof ReadSource>;

const Quoted = z
  .object({
    value: z.string().min(1).max(400),
    /** The line the value was read from, copied exactly. Checked against the text before anything is stored. */
    source_quote: z.string().min(1).max(600),
    source: ReadSource,
  })
  .nullable();

const QuotedNumber = z
  .object({ value: z.number(), source_quote: z.string().min(1).max(600), source: ReadSource })
  .nullable();

const PartyRead = z.object({
  role: z.enum(["shipper", "on_behalf_of", "consignee", "notify_party"]),
  name: z.string().min(1).max(300),
  /** The lines under the name, where the mail carries them. It belongs to this sighting and not to the company. */
  address: z.string().max(600).nullable(),
  source_quote: z.string().min(1).max(600),
  source: ReadSource,
});

const PersonRead = z.object({
  /** How this person appeared: they sent it, they signed the text, or they were written to. */
  sighting: z.enum(["sender", "signer", "addressee"]),
  name: z.string().max(200).nullable(),
  email: z.string().max(200).nullable(),
  company: z.string().max(300).nullable(),
  title: z.string().max(200).nullable(),
  source_quote: z.string().min(1).max(600),
  source: ReadSource,
});

export const ShipmentReadOutput = z.object({
  references: z.object({
    oc_no: Quoted,
    bl_no: Quoted,
    booking_ref: Quoted,
    invoice_no: Quoted,
    po_no: Quoted,
  }),
  parties: z.array(PartyRead).max(12),
  ports: z.object({ port_of_loading: Quoted, port_of_discharge: Quoted }),
  carrier: Quoted,
  vessel: Quoted,
  voyage: Quoted,
  goods: Quoted,
  hs_code: Quoted,
  container_count: QuotedNumber,
  container_type: Quoted,
  gross_weight_kg: QuotedNumber,
  trade_term: Quoted,
  payment_term: Quoted,
  bl_type: Quoted,
  freight: Quoted,
  /** The date the mail states in its own text, as ISO. Null where it states none: an email has no sent time. */
  mail_date: z
    .object({ value: z.iso.date(), source_quote: z.string().min(1).max(600), source: ReadSource })
    .nullable(),
  people: z.array(PersonRead).max(12),
});
export type ShipmentReadOutput = z.infer<typeof ShipmentReadOutput>;

export interface ShipmentReadInput {
  subject: string;
  body: string;
  /** Each already-parsed document: the role it was given, and its extracted text cut to the cap. */
  documents: { role: string; text: string }[];
  /** Reduced for a category that is not a shipment: people, vessel and date only. */
  reduced: boolean;
}

/** One call per email. The model reads the codes; no parser is written for them. */
export async function readShipment(
  deps: StructuredDeps,
  prompt: Prompt,
  input: ShipmentReadInput,
  ids: CallIds,
): Promise<StructuredResult<ShipmentReadOutput>> {
  return callStructured(deps, {
    prompt,
    input: {
      subject: input.subject,
      body: input.body,
      documents: input.documents.map((document) => `--- ${document.role} ---\n${document.text}`),
      "read this much": input.reduced
        ? "This email is not a shipment request. Read only the people, the vessel and the date; leave every other field null."
        : "Read everything the email and its documents state.",
    },
    schema: ShipmentReadOutput,
    project: WORKER_PROJECT,
    ...ids,
  });
}
