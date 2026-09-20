// pnpm ontology:export [--out ./profiles]
//
// Writes every profile out as a folder of Markdown, for a person who wants to
// read them. Nothing reads that folder back: the rows are the source of truth,
// because a file per company cannot join to "shipped since January" and a
// second copy is a second thing to keep level.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { closePool, closeRoPool, getPool } from "../src/db";

const { values } = parseArgs({ options: { out: { type: "string" } } });
const out = values.out ?? "profiles";

/** One file name per thing, with nothing in it a filesystem will argue about. */
function fileNameFor(kind: string, canonical: string, id: string): string {
  const slug = canonical.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${kind}/${slug || "unnamed"}-${id}.md`;
}

const pool = getPool();
const { rows } = await pool.query<{ id: string; kind: string; canonical: string; profile_md: string }>(
  `select id::text as id, kind, canonical, profile_md
     from core.entities
    where profile_md is not null and merged_into is null
    order by kind, canonical`,
);

for (const kind of new Set(rows.map((row) => row.kind))) await mkdir(join(out, kind), { recursive: true });
for (const row of rows) await writeFile(join(out, fileNameFor(row.kind, row.canonical, row.id)), `${row.profile_md}\n`, "utf8");

console.log(rows.length === 0 ? "no profiles have been written yet" : `wrote ${rows.length} profiles under ${out}/`);
await closePool();
await closeRoPool();
