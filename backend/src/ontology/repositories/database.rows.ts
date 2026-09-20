import type { ForeignKeyCount, TablePage, TableRowDetail } from "../../contracts";
import type { Queryable } from "../../db";
import { columnsOf, primaryKeyOf, referencesTo, safeIdentifier } from "./database.repo";

/**
 * A page of one relation, and one row of it opened.
 *
 * The SQL that produced the page goes back with the rows and is printed along
 * the foot of the grid. That is not debug output: it is the same argument the
 * chat makes with its query block, made by the page a judge is most likely to
 * disbelieve.
 */

/**
 * Rendered to text here rather than in the frontend.
 *
 * The alternative is a union of every Postgres type crossing the wire and a
 * second renderer that has to agree with Postgres about timezones. One of
 * those is a contract and the other is a bug waiting for March.
 */
function render(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.length === 0 ? "{}" : `{${value.join(", ")}}`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export interface PageRequest {
  schema: "core" | "analytics";
  name: string;
  limit: number;
  offset: number;
}

export async function tablePage(db: Queryable, request: PageRequest): Promise<TablePage | null> {
  const schema = safeIdentifier(request.schema);
  const name = safeIdentifier(request.name);
  const columns = await columnsOf(db, schema, name);
  if (columns.length === 0) return null;

  // An ordered page needs a stable order, and the primary key is the only
  // column every row is guaranteed to differ on. Without one, the relation's
  // own order stands: a view has no key and no inherent order to promise.
  const key = await primaryKeyOf(db, schema, name);
  const order = key ? ` order by ${safeIdentifier(key)} desc` : "";
  const sql = `select * from ${schema}.${name}${order} limit ${request.limit} offset ${request.offset}`;

  const [page, total] = await Promise.all([
    db.query<Record<string, unknown>>(sql),
    db.query<{ n: string }>(`select count(*)::text as n from ${schema}.${name}`),
  ]);

  return {
    schema,
    name,
    columns,
    rows: page.rows.map((row) => columns.map((column) => render(row[column.name]))),
    total: Number(total.rows[0].n),
    limit: request.limit,
    offset: request.offset,
    sql,
  };
}

/** Which object type a table's row is, when the ontology holds one. The drawer's `see it as a record` button. */
const AS_OBJECT: Record<string, string> = {
  emails: "email",
  comparisons: "comparison",
  clients: "client",
};

/** Null when the relation has no single-column key, or when no row carries that id. */
export async function rowDetail(
  db: Queryable,
  schemaName: "core" | "analytics",
  tableName: string,
  id: string,
): Promise<TableRowDetail | null> {
  const schema = safeIdentifier(schemaName);
  const name = safeIdentifier(tableName);
  const key = await primaryKeyOf(db, schema, name);
  if (!key) return null;

  const columns = await columnsOf(db, schema, name);
  const { rows } = await db.query<Record<string, unknown>>(
    // The key is cast to text so one query serves a bigserial, a uuid and a
    // text key alike; the page has the id as a string either way.
    `select * from ${schema}.${name} where ${safeIdentifier(key)}::text = $1::text limit 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  const references = await referencesTo(db, schema, name);
  const referencedBy: ForeignKeyCount[] = await Promise.all(
    references.map(async (reference) => {
      const { rows: counted } = await db.query<{ n: string }>(
        `select count(*)::text as n from ${schema}.${safeIdentifier(reference.table)} where ${safeIdentifier(reference.column)}::text = $1::text`,
        [id],
      );
      return { table: reference.table, column: reference.column, count: Number(counted[0].n) };
    }),
  );

  const objectType = AS_OBJECT[name];
  return {
    schema,
    name,
    id,
    fields: columns.map((column) => ({
      key: column.name,
      columnType: column.columnType,
      value: render(row[column.name]),
    })),
    referencedBy,
    asObject: objectType ? { type: objectType, id } : null,
  };
}
