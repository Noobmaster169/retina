import { TableList, TablePage, TableRowDetail, type TableSummary } from "./database-schemas";
import { get } from "./transport";

export type { ColumnInfo, ColumnType, ForeignKeyCount, TablePage, TableRowDetail, TableSummary } from "./database-schemas";

/** Every relation of `core` and `analytics`, with an exact row count. */
export async function listTables(): Promise<TableSummary[]> {
  return (await get(TableList, "/database/tables")).tables;
}

/** One page of one relation, with the SQL that produced it. */
export async function getTablePage(
  schema: string,
  name: string,
  page: { limit?: number; offset?: number } = {},
): Promise<TablePage | null> {
  const query = new URLSearchParams();
  if (page.limit !== undefined) query.set("limit", String(page.limit));
  if (page.offset !== undefined) query.set("offset", String(page.offset));
  const suffix = query.size > 0 ? `?${query}` : "";
  return orNull(get(TablePage, `/database/tables/${schema}/${name}${suffix}`));
}

/** One row as fields, then what points at it by foreign key. Null where the relation has no single-column key. */
export async function getRowDetail(schema: string, name: string, id: string): Promise<TableRowDetail | null> {
  return orNull(get(TableRowDetail, `/database/tables/${schema}/${name}/rows/${encodeURIComponent(id)}`));
}

/** A 404 means there is nothing to draw, which the page says in its own words. Anything else still throws. */
async function orNull<T>(reading: Promise<T>): Promise<T | null> {
  try {
    return await reading;
  } catch (error) {
    if (error instanceof Error && /→ 404$/.test(error.message)) return null;
    throw error;
  }
}
