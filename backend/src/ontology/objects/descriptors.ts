import type { TypeDescriptor } from "./types";

/**
 * One row per type the ontology names, built or not.
 *
 * A data table and nothing else, apart from types.ts so that reading how a
 * type is counted is not reading fifteen paragraphs about what each one is.
 * A type with no table is `planned`: the rail draws it dashed and the routes
 * 404 it, which is more honest than leaving a designed part of the model off
 * the page.
 */
export const DESCRIPTORS: TypeDescriptor[] = [
  {
    type: "run",
    label: "Run",
    plural: "Runs",
    table: "core.runs",
    blurb: "One replay of the inbox. Everything else is read through one of these.",
    navigable: false,
  },
  {
    type: "email",
    label: "Email",
    plural: "Emails",
    table: "core.emails",
    blurb: "One message as it arrived, with whatever was attached to it.",
    navigable: true,
  },
  {
    type: "attachment",
    label: "Attachment",
    plural: "Attachments",
    table: "core.attachments",
    blurb: "One file that arrived with an email, copied into object storage exactly as it came.",
    navigable: false,
  },
  {
    type: "document",
    label: "Document",
    plural: "Documents",
    table: "core.documents",
    blurb: "One attachment as the parser recovered it, and what the model says it is.",
    navigable: false,
  },
  {
    type: "comparison",
    label: "Comparison",
    plural: "Comparisons",
    table: "core.comparisons",
    blurb:
      "One check of one instruction against one draft bill of lading. It holds seven judgements and nothing else. It never records which document is right.",
    navigable: false,
  },
  {
    type: "difference",
    label: "Difference",
    plural: "Differences",
    table: "core.field_diffs",
    blurb: "One field where the two documents did not say the same thing.",
    navigable: false,
  },
  {
    type: "field",
    label: "Field",
    plural: "Fields",
    table: "core.extraction_fields",
    blurb: "One of the seven values, read from one document, with the line it was quoted from.",
    navigable: false,
  },
  {
    type: "client",
    label: "Client",
    plural: "Clients",
    table: "core.clients",
    blurb: "A sender domain, and the tier that decides whose work is served first.",
    // Folded into Party: a sender domain and a consignee are the same company
    // read two ways, and two entries for it was the confusing part. `/clients`
    // is still where a tier is set.
    navigable: false,
  },
  {
    type: "port",
    label: "Port",
    plural: "Ports",
    table: "core.entities",
    blurb:
      "A place, read out of the loading and discharge fields of documents. Nobody typed it in: it exists because the field judge accepted several spellings as one place.",
    navigable: true,
  },
  {
    type: "party",
    label: "Party",
    plural: "Parties",
    table: "core.entities",
    blurb:
      "A company, read out of the shipper, consignee and notify party fields, senders included. Resolved the same way a port is, and by the same judge.",
    navigable: true,
  },
  {
    type: "shipment",
    label: "Shipment",
    plural: "Shipments",
    table: null,
    blurb:
      "A booking across its instruction, its draft and its invoice query. Designed and not built: core.email_shipments holds one row per email, and nothing yet groups them into one shipment.",
    navigable: true,
  },
  {
    type: "carrier",
    label: "Carrier",
    plural: "Carriers",
    table: "core.entities",
    blurb:
      "A shipping line, read out of a subject line or a document by the shipment reader. Resolved the same way a port is, and by a model, not a list of carrier names.",
    navigable: true,
  },
  {
    type: "vessel",
    label: "Vessel",
    plural: "Vessels",
    table: "core.entities",
    blurb: "A ship, read where the mail names one. A voyage of it is a column on the shipment, not a thing of its own.",
    navigable: true,
  },
  {
    type: "commodity",
    label: "Commodity",
    plural: "Commodities",
    table: "core.entities",
    blurb: "What is being shipped, as the mail describes it. Everything this mailbox carries is paper; nothing here assumes that.",
    navigable: true,
  },
  {
    type: "person",
    label: "Person",
    plural: "People",
    table: "core.entities",
    blurb:
      "Somebody who sent, signed or was written to. Two sightings become one person only where a model cited the address or the header that ties them.",
    navigable: true,
  },
];
