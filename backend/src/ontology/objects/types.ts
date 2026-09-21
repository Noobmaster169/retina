import type { ObjectType, ObjectTypeSummary } from "../../contracts";
import type { Queryable } from "../../db";
import { DESCRIPTORS } from "./descriptors";

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
export const BY_TYPE = new Map(DESCRIPTORS.map((descriptor) => [descriptor.type, descriptor]));

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
  const shipments = await db.query<{ n: string }>("select count(*)::text as n from core.shipments");
  const counts: Record<string, number> = {
    email: Number(emails.rows[0].n),
    shipment: Number(shipments.rows[0].n),
  };
  for (const row of things.rows) counts[row.kind] = Number(row.n);

  return NAVIGABLE.map((descriptor) => ({
    type: descriptor.type,
    label: descriptor.plural,
    table: descriptor.table,
    count: counts[descriptor.type] ?? 0,
    built: descriptor.table !== null,
  }));
}
