import type { Queryable } from "../../db";
import { safeIdentifier } from "./database.repo";

/**
 * What one column holds: how many rows, how many distinct values, and the
 * values themselves, most frequent first.
 *
 * The one place an identifier is interpolated into SQL, so it is checked twice:
 * the column must exist in `information_schema` as the connection sees it
 * (on `roPool` that is exactly what `retina_ro` may read, column grants
 * included), and both names must pass `safeIdentifier` before they are quoted.
 */

const TOP_VALUES = 30;
const VALUE_WIDTH = 120;

export interface ColumnProfile {
  relation: string;
  column: string;
  dataType: string;
  rows: number;
  distinct: number;
  nulls: number;
  min: string | null;
  max: string | null;
  top: { value: string | null; count: number }[];
}

export type ProfileOutcome = { ok: true; profile: ColumnProfile } | { ok: false; reason: string };

/** Types with an order worth reporting. A text column's min and max are alphabetical noise. */
const ORDERED = /^(smallint|integer|bigint|numeric|real|double precision|date|timestamp)/;

export async function profileColumn(db: Queryable, relation: string, column: string): Promise<ProfileOutcome> {
  const [schema, table, ...rest] = relation.split(".");
  if (!schema || !table || rest.length > 0) {
    return { ok: false, reason: `"${relation}" is not a schema-qualified relation such as core.emails` };
  }
  if (schema !== "core" && schema !== "analytics") {
    return { ok: false, reason: `only the core and analytics schemas can be profiled, not "${schema}"` };
  }

  const found = await db.query<{ data_type: string }>(
    `select data_type from information_schema.columns
      where table_schema = $1::text and table_name = $2::text and column_name = $3::text`,
    [schema, table, column],
  );
  if (found.rows.length === 0) {
    return { ok: false, reason: `${relation} has no column "${column}" that this connection may read` };
  }
  const dataType = found.rows[0].data_type;

  const from = `"${safeIdentifier(schema)}"."${safeIdentifier(table)}"`;
  const col = `"${safeIdentifier(column)}"`;
  const bounds = ORDERED.test(dataType)
    ? `min(${col})::text as min, max(${col})::text as max`
    : "null::text as min, null::text as max";

  const [totals, top] = await Promise.all([
    db.query<{ rows: string; distinct: string; nulls: string; min: string | null; max: string | null }>(
      `select count(*)::text as rows, count(distinct ${col}::text)::text as distinct,
              count(*) filter (where ${col} is null)::text as nulls, ${bounds}
         from ${from}`,
    ),
    db.query<{ value: string | null; n: string }>(
      `select left(${col}::text, ${VALUE_WIDTH}) as value, count(*)::text as n
         from ${from} group by 1 order by count(*) desc, 1 asc limit ${TOP_VALUES}`,
    ),
  ]);

  const head = totals.rows[0];
  return {
    ok: true,
    profile: {
      relation,
      column,
      dataType,
      rows: Number(head.rows),
      distinct: Number(head.distinct),
      nulls: Number(head.nulls),
      min: head.min,
      max: head.max,
      top: top.rows.map((row) => ({ value: row.value, count: Number(row.n) })),
    },
  };
}
