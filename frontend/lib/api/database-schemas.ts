import { z } from "zod";

/**
 * Mirrors backend/src/contracts.database.ts by hand. A drift fails here,
 * naming the field, instead of reaching the grid as undefined.
 */

export const ColumnType = z.enum(["pk", "fk", "abc", "123", "1.0", "date", "bool", "json", "list"]);
export type ColumnType = z.infer<typeof ColumnType>;

export const TableSummary = z.object({
  schema: z.enum(["core", "analytics"]),
  name: z.string(),
  rows: z.number().int(),
  kind: z.enum(["table", "view", "materialized view"]),
});
export type TableSummary = z.infer<typeof TableSummary>;

export const TableList = z.object({ tables: z.array(TableSummary) });
export type TableList = z.infer<typeof TableList>;

export const ColumnInfo = z.object({
  name: z.string(),
  columnType: ColumnType,
  dataType: z.string(),
  nullable: z.boolean(),
});
export type ColumnInfo = z.infer<typeof ColumnInfo>;

export const TablePage = z.object({
  schema: z.string(),
  name: z.string(),
  columns: z.array(ColumnInfo),
  /** Already rendered to text by the backend, so no second renderer can disagree with Postgres about a date. */
  rows: z.array(z.array(z.string().nullable())),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  /** Printed along the foot of the grid, exactly as it ran. */
  sql: z.string(),
});
export type TablePage = z.infer<typeof TablePage>;

export const ForeignKeyCount = z.object({
  table: z.string(),
  column: z.string(),
  count: z.number().int(),
});
export type ForeignKeyCount = z.infer<typeof ForeignKeyCount>;

export const TableRowDetail = z.object({
  schema: z.string(),
  name: z.string(),
  id: z.string(),
  fields: z.array(z.object({ key: z.string(), columnType: ColumnType, value: z.string().nullable() })),
  referencedBy: z.array(ForeignKeyCount),
  asObject: z.object({ type: z.string(), id: z.string() }).nullable(),
});
export type TableRowDetail = z.infer<typeof TableRowDetail>;
