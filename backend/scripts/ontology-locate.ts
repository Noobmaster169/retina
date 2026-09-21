// pnpm ontology:locate [--all]
//
// Places every live port the reference list knows and gives every company
// with a country its code, then runs one resolution pass so that two ports
// placed at one code fold into one. Idempotent: a thing already placed is
// skipped, and a pass over folded data changes nothing. Free: no model call
// anywhere in it.
//
// `--all` places the ports already placed again, which is how a fix to the
// reference lookup reaches the things an earlier pass got wrong. It writes
// every key of a placement afresh, except the ones a person settled.

import { closePool, getPool, withTx } from "../src/db";
import { resolveAll } from "../src/ontology/derived";
import { entityLocate, entityProfile } from "../src/ontology/repositories";

const again = process.argv.includes("--all");
const pool = getPool();
const rows = await entityLocate.unlocated(pool, again);
let ports = 0;
let parties = 0;
const missed: string[] = [];
for (const row of rows) {
  if (row.kind === "port") {
    const placed = await withTx(pool, (tx) => entityLocate.locateEntity(tx, row.id, row.kind, row.canonical));
    if (placed) ports += 1;
    else missed.push(row.canonical);
    continue;
  }
  const code = entityLocate.countryCodeFor(row.attributes);
  if (!code) {
    missed.push(`${row.canonical} (country ${row.attributes.country})`);
    continue;
  }
  await entityProfile.mergeAttributes(pool, row.id, { countryCode: code }, { countryCode: { source: "reference", confidence: null, llmCallId: null } });
  parties += 1;
}
console.log(`${ports} ports placed, ${parties} companies given a country code, ${missed.length} not in the reference lists`);
for (const name of missed) console.log(`  ${name}`);
const live = await pool.query<{ n: string }>("select count(*)::text as n from core.entities where kind = 'port' and merged_into is null");
const things = await resolveAll(pool);
const after = await pool.query<{ n: string }>("select count(*)::text as n from core.entities where kind = 'port' and merged_into is null");
console.log(`${things} things resolved; live ports ${live.rows[0].n} before the pass, ${after.rows[0].n} after`);
await closePool();
