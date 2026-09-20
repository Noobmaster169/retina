import type { ObjectType, ObjectTypeSummary } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * Every type the ontology knows, what it reads, and whether it exists yet.
 *
 * A hand-written table, and legitimately so: this is knowledge about our own
 * schema, not a rule fitted to a dataset. Nothing here decides a category or
 * judges a value; it says which table the word `Document` means.
 */

export interface TypeDescriptor {
  type: ObjectType;
  label: string;
  /** Plural, for the index page's heading. */
  plural: string;
  /** The relation its count comes from, or null for a type nothing stores yet. */
  table: string | null;
  /** One sentence on what this kind of thing is, shown under the title. */
  blurb: string;
  /**
   * Whether the ontology rail offers it.
   *
   * Five types do: the email, the two the model resolves out of documents, and
   * the two that are designed and drawn dashed. The rest are real and are
   * reached through an object rather than browsed: nobody opens a list of 3,178
   * Fields or 538 Comparisons, they arrive at one from the email it belongs to.
   * Listing every table as a destination was the clutter.
   *
   * A non-navigable type is still an ObjectType: the graph draws its nodes, the
   * link cards name it, and `GET /ontology/:type/:id` serves it.
   */
  navigable: boolean;
}

/**
 * In the order the rail draws them: what the pipeline writes first, then what
 * the model resolved out of documents, then what is designed and not built.
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

const BY_TYPE = new Map(DESCRIPTORS.map((descriptor) => [descriptor.type, descriptor]));

export function descriptorFor(type: ObjectType): TypeDescriptor {
  return BY_TYPE.get(type) as TypeDescriptor;
}

/** A type with no table is `planned`. The rail draws it dashed and the routes 404 it. */
export function isBuilt(type: ObjectType): boolean {
  return descriptorFor(type).table !== null;
}

/** The types the ontology rail offers. See `TypeDescriptor.navigable`. */
export const NAVIGABLE = DESCRIPTORS.filter((descriptor) => descriptor.navigable);

/**
 * The navigable types with their live counts.
 *
 * Two queries: the emails, and one grouped count over the resolved things. A
 * kind with no rows reads 0 and stays in the rail, because an empty index is
 * an answer and a missing one is a question.
 */
export async function listTypes(db: Queryable): Promise<ObjectTypeSummary[]> {
  const emails = await db.query<{ n: string }>("select count(*)::text as n from core.emails");
  const things = await db.query<{ kind: string; n: string }>(
    "select kind, count(*)::text as n from core.entities where merged_into is null group by kind",
  );
  const counts: Record<string, number> = { email: Number(emails.rows[0].n) };
  for (const row of things.rows) counts[row.kind] = Number(row.n);

  return NAVIGABLE.map((descriptor) => ({
    type: descriptor.type,
    label: descriptor.plural,
    table: descriptor.table,
    count: counts[descriptor.type] ?? 0,
    built: descriptor.table !== null,
  }));
}
