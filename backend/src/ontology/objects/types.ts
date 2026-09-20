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
  },
  {
    type: "email",
    label: "Email",
    plural: "Emails",
    table: "core.emails",
    blurb: "One message as it arrived, with whatever was attached to it.",
  },
  {
    type: "attachment",
    label: "Attachment",
    plural: "Attachments",
    table: "core.attachments",
    blurb: "One file that arrived with an email, copied into object storage exactly as it came.",
  },
  {
    type: "document",
    label: "Document",
    plural: "Documents",
    table: "core.documents",
    blurb: "One attachment as the parser recovered it, and what the model says it is.",
  },
  {
    type: "comparison",
    label: "Comparison",
    plural: "Comparisons",
    table: "core.comparisons",
    blurb:
      "One check of one instruction against one draft bill of lading. It holds seven judgements and nothing else. It never records which document is right.",
  },
  {
    type: "difference",
    label: "Difference",
    plural: "Differences",
    table: "core.field_diffs",
    blurb: "One field where the two documents did not say the same thing.",
  },
  {
    type: "field",
    label: "Field",
    plural: "Fields",
    table: "core.extraction_fields",
    blurb: "One of the seven values, read from one document, with the line it was quoted from.",
  },
  {
    type: "client",
    label: "Client",
    plural: "Clients",
    table: "core.clients",
    blurb: "A sender domain, and the tier that decides whose work is served first.",
  },
  {
    type: "port",
    label: "Port",
    plural: "Ports",
    table: "core.entities",
    blurb:
      "A place, read out of the loading and discharge fields of documents. Nobody typed it in: it exists because the field judge accepted several spellings as one place.",
  },
  {
    type: "party",
    label: "Party",
    plural: "Parties",
    table: "core.entities",
    blurb:
      "A company, read out of the shipper, consignee and notify party fields. Resolved the same way a port is, and by the same judge.",
  },
  {
    type: "shipment",
    label: "Shipment",
    plural: "Shipments",
    table: null,
    blurb:
      "A booking. Designed and not built: nothing in the organisers' seven fields yields one, so there is no honest way to fill it yet.",
  },
  {
    type: "carrier",
    label: "Carrier",
    plural: "Carriers",
    table: null,
    blurb: "A line. Designed and not built, for the same reason a shipment is not.",
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

/**
 * Every type with its live count.
 *
 * One query per relation rather than a union, because `port` and `party` share
 * a table and need a filter that the others do not, and a union that carried
 * that filter would be harder to read than six counts.
 */
export async function listTypes(db: Queryable): Promise<ObjectTypeSummary[]> {
  const { rows } = await db.query<Record<string, string>>(
    `select (select count(*) from core.runs)::text as run,
            (select count(*) from core.emails)::text as email,
            (select count(*) from core.attachments)::text as attachment,
            (select count(*) from core.documents)::text as document,
            (select count(*) from core.comparisons)::text as comparison,
            (select count(*) from core.field_diffs where not same and not missing)::text as difference,
            (select count(*) from core.extraction_fields)::text as field,
            (select count(distinct sender_domain) from core.emails)::text as client,
            (select count(*) from core.entities where kind = 'port')::text as port,
            (select count(*) from core.entities where kind = 'party')::text as party`,
  );
  const counts = rows[0];

  return DESCRIPTORS.map((descriptor) => ({
    type: descriptor.type,
    label: descriptor.plural,
    table: descriptor.table,
    count: Number(counts[descriptor.type] ?? 0),
    built: descriptor.table !== null,
  }));
}
