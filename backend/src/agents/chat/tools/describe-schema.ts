import { z } from "zod";

import { type ChatTool, refused, type ToolContext, type ToolOutcome } from "./types";

/**
 * The columns of a table, from `information_schema`.
 *
 * The prompt already carries hand-written documentation of the views the agent
 * should mostly use; this is for the question that goes past it. Live rather
 * than written down, so a column added by a migration is visible to the agent
 * the moment it exists and nobody has to remember to update a markdown file.
 */

const Input = z.object({
  schema: z.enum(["core", "analytics"]).optional(),
  /** Unqualified. Absent, every table of the schema is listed with its columns. */
  table: z.string().max(120).optional(),
});
type Input = z.infer<typeof Input>;

interface ColumnRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
}

export const describeSchema: ChatTool<Input> = {
  name: "describe_schema",
  description:
    "Lists the columns and types of the analytics and core tables. Use it when the documentation in this " +
    "prompt does not say whether a column exists, rather than guessing a name and reading the error.",
  schema: Input,
  shape: Input.shape,

  async run(input, ctx: ToolContext): Promise<ToolOutcome> {
    if (!ctx.roPool) {
      return refused("the read-only database connection is not configured (DATABASE_RO_URL is unset)");
    }

    // A materialized view has no information_schema.columns row, because
    // information_schema only covers standard SQL objects and a matview is not
    // one. Every aggregate in `analytics` is a matview, so reading that table
    // alone would report the schema as empty and send the agent off guessing.
    // pg_attribute covers all of them.
    const { rows } = await ctx.roPool.query<ColumnRow>(
      `select n.nspname as table_schema,
              c.relname  as table_name,
              a.attname  as column_name,
              format_type(a.atttypid, a.atttypmod) as data_type,
              case when a.attnotnull then 'NO' else 'YES' end as is_nullable
         from pg_attribute a
         join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = coalesce($1, n.nspname)
          and n.nspname in ('core', 'analytics')
          and c.relname = coalesce($2, c.relname)
          and c.relkind in ('r', 'v', 'm')
          and a.attnum > 0
          and not a.attisdropped
        order by n.nspname, c.relname, a.attnum`,
      [input.schema ?? null, input.table ?? null],
    );

    if (rows.length === 0) {
      const named = input.table ? `\`${input.table}\`` : `schema \`${input.schema}\``;
      return refused(`${named} does not exist, or is not one this connection may read`);
    }

    const byTable = new Map<string, string[]>();
    for (const row of rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      const line = `  ${row.column_name} ${row.data_type}${row.is_nullable === "NO" ? " not null" : ""}`;
      const held = byTable.get(key);
      if (held) held.push(line);
      else byTable.set(key, [line]);
    }

    const text = [...byTable.entries()].map(([table, lines]) => `${table}\n${lines.join("\n")}`).join("\n\n");
    const tables = [...byTable.keys()];

    return {
      ok: true,
      text,
      preview: `${tables.length} ${tables.length === 1 ? "table" : "tables"}, ${rows.length} columns`,
      touched: [{ relation: "pg_catalog", count: tables.length }],
      entities: tables.slice(0, 6),
    };
  },
};
