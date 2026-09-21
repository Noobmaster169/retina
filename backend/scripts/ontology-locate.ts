// pnpm ontology:locate
//
// Places every live port the reference list knows and gives every company
// with a country its code. Idempotent: a thing already placed is skipped.
// Free: no model call anywhere in it.

import { closePool, getPool, withTx } from "../src/db";
import { entityLocate, entityProfile } from "../src/ontology/repositories";

const pool = getPool();
const rows = await entityLocate.unlocated(pool);
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
await closePool();
