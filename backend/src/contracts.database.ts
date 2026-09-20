import { z } from "zod";

/**
 * The database as rows: every table in the schema, its typed columns, and the
 * SQL that produced the page.
 *
 * Re-exported from contracts.ts; mirrored by hand in
 * frontend/lib/api/database-schemas.ts.
 *
 * It exists because a judge should be able to see the rows
 * (docs/design/screen-blueprints.md section 8). Everything here is read
 * through the `retina_ro` pool and the same guardrail the chat's `run_sql`
 * uses, so there is exactly one path in this product that runs generated SQL
 * and exactly one set of rules on it.
 */

/** The badge in front of a column name. Derived from the Postgres type, not from the column's name. */
export const ColumnType = z.enum(["pk", "fk", "abc", "123", "1.0", "date", "bool", "json", "list"]);
export type ColumnType = z.infer<typeof ColumnType>;

export const TableSummary = z.object({
  schema: z.enum(["core", "analytics"]),
  name: z.string(),
  /** The table's own name is the label. A schema browser that renames tables is lying about the schema. */
  rows: z.number().int(),
  /** A materialized view is a table to a reader and a derived thing to a writer; the page says which. */
  kind: z.enum(["table", "view", "materialized view"]),
});
export type TableSummary = z.infer<typeof TableSummary>;

export const TableList = z.object({ tables: z.array(TableSummary) });
export type TableList = z.infer<typeof TableList>;

export const ColumnInfo = z.object({
  name: z.string(),
  columnType: ColumnType,
  /** The Postgres type, shown on hover. `smallint`, `timestamptz`, `text[]`. */
  dataType: z.string(),
  nullable: z.boolean(),
});
export type ColumnInfo = z.infer<typeof ColumnInfo>;

/**
 * A page of one table.
 *
 * Values are strings or null, already rendered. The alternative is a union of
 * every Postgres type crossing the wire and a second renderer in the frontend
 * that has to agree with Postgres about dates; one of those is a contract and
 * the other is a bug waiting for a timezone.
 */
export const TablePage = z.object({
  schema: z.string(),
  name: z.string(),
  columns: z.array(ColumnInfo),
  rows: z.array(z.array(z.string().nullable())),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  /** Printed along the foot of the grid, exactly as it ran. */
  sql: z.string(),
});
export type TablePage = z.infer<typeof TablePage>;

/** One table that points at the selected row, and how many of its rows do. */
export const ForeignKeyCount = z.object({
  table: z.string(),
  /** The column on the other table that holds this row's key. */
  column: z.string(),
  count: z.number().int(),
});
export type ForeignKeyCount = z.infer<typeof ForeignKeyCount>;

/** The 380px drawer: the row as fields, then what points at it. */
export const TableRowDetail = z.object({
  schema: z.string(),
  name: z.string(),
  id: z.string(),
  fields: z.array(z.object({ key: z.string(), columnType: ColumnType, value: z.string().nullable() })),
  referencedBy: z.array(ForeignKeyCount),
  /** Where this row is a thing rather than a row, when the ontology knows it. */
  asObject: z.object({ type: z.string(), id: z.string() }).nullable(),
});
export type TableRowDetail = z.infer<typeof TableRowDetail>;
