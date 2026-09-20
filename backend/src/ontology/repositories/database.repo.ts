import type { ColumnInfo, ColumnType, TableSummary } from "../../contracts";
import type { Queryable } from "../../db";
import { TerminalError } from "../../lib/errors";

/**
 * The schema as rows, for the page a judge can see the rows on.
 *
 * Every identifier that reaches a query here came out of `pg_catalog` first
 * and is checked against a conservative pattern second. A table name cannot be
 * a bind parameter, so the only safe way to put one in a query is to have read
 * it from the catalog; the pattern is there because "it came from the catalog"
 * is an argument about this code staying the way it is, and the check is an
 * argument about the string.
 */

/** What a Postgres type is drawn as. By type, never by the column's name. */
function columnTypeOf(dataType: string, isPrimaryKey: boolean, isForeignKey: boolean): ColumnType {
  if (isPrimaryKey) return "pk";
  if (isForeignKey) return "fk";
  if (dataType.endsWith("[]")) return "list";
  if (dataType.startsWith("timestamp") || dataType === "date") return "date";
  if (dataType === "boolean") return "bool";
  if (dataType === "jsonb" || dataType === "json") return "json";
  if (dataType === "numeric" || dataType === "real" || dataType === "double precision") return "1.0";
  if (dataType.startsWith("int") || dataType === "smallint" || dataType === "bigint") return "123";
  return "abc";
}

/** Lower snake case and nothing else. Anything a migration of ours could have named. */
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function safeIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new TerminalError(`"${name}" is not a relation this page may read`);
  return name;
}

const KIND_OF: Record<string, TableSummary["kind"]> = { r: "table", v: "view", m: "materialized view" };

interface RelationRow {
  table_schema: "core" | "analytics";
  table_name: string;
  relkind: string;
}

/** Every relation of the two schemas. The names the counts and the pages are then read through. */
export async function listRelations(db: Queryable): Promise<RelationRow[]> {
  const { rows } = await db.query<RelationRow>(
    `select n.nspname as table_schema, c.relname as table_name, c.relkind::text as relkind
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('core', 'analytics') and c.relkind in ('r', 'v', 'm')
      order by n.nspname, c.relname`,
  );
  return rows.filter((row) => IDENTIFIER.test(row.table_name));
}

/**
 * Every relation with an exact row count.
 *
 * Exact and not `reltuples`, because the estimate is -1 until a table has been
 * analysed and this page would open showing every table as empty. One query
 * over twenty relations of a few thousand rows costs nothing; if that stops
 * being true, this is the line to change.
 */
export async function listTables(db: Queryable): Promise<TableSummary[]> {
  const relations = await listRelations(db);
  if (relations.length === 0) return [];

  const counted = relations
    .map(
      (relation) =>
        `select '${relation.table_schema}' as s, '${safeIdentifier(relation.table_name)}' as t, ` +
        `count(*)::text as n from ${relation.table_schema}.${safeIdentifier(relation.table_name)}`,
    )
    .join(" union all ");

  const { rows } = await db.query<{ s: string; t: string; n: string }>(counted);
  const counts = new Map(rows.map((row) => [`${row.s}.${row.t}`, Number(row.n)]));

  return relations.map((relation) => ({
    schema: relation.table_schema,
    name: relation.table_name,
    rows: counts.get(`${relation.table_schema}.${relation.table_name}`) ?? 0,
    kind: KIND_OF[relation.relkind] ?? "table",
  }));
}

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  is_pk: boolean;
  is_fk: boolean;
}

/** A matview has no information_schema row, so this reads pg_catalog, which covers all three kinds. */
export async function columnsOf(db: Queryable, schema: string, table: string): Promise<ColumnInfo[]> {
  const { rows } = await db.query<ColumnRow>(
    `select a.attname as column_name,
            format_type(a.atttypid, a.atttypmod) as data_type,
            not a.attnotnull as is_nullable,
            coalesce(pk.is_pk, false) as is_pk,
            coalesce(fk.is_fk, false) as is_fk
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       left join lateral (
         select true as is_pk from pg_constraint k
          where k.conrelid = c.oid and k.contype = 'p' and a.attnum = any(k.conkey)
       ) pk on true
       left join lateral (
         select true as is_fk from pg_constraint k
          where k.conrelid = c.oid and k.contype = 'f' and a.attnum = any(k.conkey)
       ) fk on true
      where n.nspname = $1::text and c.relname = $2::text and a.attnum > 0 and not a.attisdropped
      order by a.attnum`,
    [schema, table],
  );
  return rows.map((row) => ({
    name: row.column_name,
    columnType: columnTypeOf(row.data_type, row.is_pk, row.is_fk),
    dataType: row.data_type,
    nullable: row.is_nullable,
  }));
}

/** The single-column primary key, or null. A page with no key cannot open a row, and says so by having no drawer. */
export async function primaryKeyOf(db: Queryable, schema: string, table: string): Promise<string | null> {
  const { rows } = await db.query<{ column_name: string; n: number }>(
    `select a.attname as column_name, array_length(k.conkey, 1) as n
       from pg_constraint k
       join pg_class c on c.oid = k.conrelid
       join pg_namespace ns on ns.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attnum = any(k.conkey)
      where k.contype = 'p' and ns.nspname = $1::text and c.relname = $2::text`,
    [schema, table],
  );
  return rows.length === 1 && rows[0].n === 1 ? rows[0].column_name : null;
}

/** Which tables hold this one's key, and on which column. What the drawer's `what points at this row` reads. */
export async function referencesTo(
  db: Queryable,
  schema: string,
  table: string,
): Promise<{ table: string; column: string }[]> {
  const { rows } = await db.query<{ table_name: string; column_name: string }>(
    `select child.relname as table_name, a.attname as column_name
       from pg_constraint k
       join pg_class child on child.oid = k.conrelid
       join pg_class parent on parent.oid = k.confrelid
       join pg_namespace pn on pn.oid = parent.relnamespace
       join pg_attribute a on a.attrelid = child.oid and a.attnum = k.conkey[1]
      where k.contype = 'f' and pn.nspname = $1::text and parent.relname = $2::text
      order by child.relname`,
    [schema, table],
  );
  return rows.filter((row) => IDENTIFIER.test(row.table_name) && IDENTIFIER.test(row.column_name))
    .map((row) => ({ table: row.table_name, column: row.column_name }));
}

export { safeIdentifier };
