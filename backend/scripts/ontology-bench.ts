// pnpm ontology:bench [--entities 200000] [--appearances 2000000]
//
// The scale check. It inserts synthetic things and sightings inside one
// transaction that is always rolled back, times a full resolution pass over
// them, and asserts with `explain analyze` that the four lookups a question
// makes each use an index and finish inside the budget.
//
// No model is called and it is not part of `pnpm test`: it takes minutes and
// it answers a design question, not a behaviour one.

import { parseArgs } from "node:util";

import { closePool, closeRoPool, getPool } from "../src/db";
import { entityInputs, entityResolution } from "../src/ontology/repositories";
import { reconcile, resolveEntities } from "../src/pipeline/ontology";

const { values } = parseArgs({
  options: { entities: { type: "string" }, appearances: { type: "string" } },
});
const ENTITIES = Number(values.entities ?? 200_000);
const APPEARANCES = Number(values.appearances ?? 2_000_000);

/** Past this a question waits visibly, which is the thing the bound exists to prevent. */
const BUDGET_MS = 200;

interface Measured {
  what: string;
  ms: number;
  plan: string;
  indexed: boolean;
}

/** `explain analyze` on one query, with whether the plan reached an index at all. */
async function measure(db: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, string>[] }> }, what: string, sql: string, params: unknown[]): Promise<Measured> {
  const { rows } = await db.query(`explain (analyze, buffers) ${sql}`, params);
  const plan = rows.map((row) => row["QUERY PLAN"]).join("\n");
  const ms = Number(/Execution Time: ([\d.]+) ms/.exec(plan)?.[1] ?? Number.NaN);
  return { what, ms, plan, indexed: /Index Scan|Index Only Scan|Bitmap Index Scan/.test(plan) };
}

const pool = getPool();
const client = await pool.connect();
let failures = 0;

try {
  await client.query("begin");
  console.log(`filling: ${ENTITIES.toLocaleString()} things, ${APPEARANCES.toLocaleString()} sightings`);

  // One synthetic email per 5,000 things: the sightings' unique key is
  // (email_id, role, source, entity_id), so one email holds many things and
  // the row count is what is being measured, not the email count.
  const emails = Math.max(1, Math.ceil(APPEARANCES / 5000));
  await client.query(
    `insert into core.emails (email_id, from_addr, sender_domain, subject, body, attachment_paths, raw)
     select 'bench_' || n, 'bench@example.test', 'example.test', 'bench ' || n, 'bench', '{}', '{}'::jsonb
       from generate_series(1, $1::int) as n`,
    [emails],
  );

  // Whatever this database already holds stays out of every query below: the
  // bench measures its own rows, inside a transaction that is rolled back.
  const before = Number(
    (await client.query<{ id: string }>("select coalesce(max(id), 0)::text as id from core.entities")).rows[0].id,
  );

  const filling = Date.now();
  // Names and trades vary, because uniform synthetic data measures the wrong
  // thing: a predicate that matches every row is a sequential scan in any
  // database, correctly, and the question here is whether a predicate that
  // matches a few hundred of two hundred thousand reaches an index.
  await client.query(
    `with pool as (
       select array['ALPHA','BRAVO','CHARLIE','DELTA','ECHO','FOXTROT','GOLF','HOTEL','INDIA','JULIET',
                    'KILO','LIMA','MIKE','NOVEMBER','OSCAR','PAPA','QUEBEC','ROMEO','SIERRA','TANGO'] as head,
              array['HOLDINGS','TRADING','PAPERBOARD','SUPPLY','CONVERTING','MERCHANTS','IMPORTS','EXPORTS',
                    'DISTRIBUTION','PACKAGING'] as tail,
              array['distributor','converter','mill','forwarder','printer','wholesaler','agent','packer',
                    'reseller','stockist','jobber','broker','importer','exporter','fabricator','laminator',
                    'sheeter','reeler','trader','merchant','bookbinder','stationer','publisher','cartonmaker',
                    'envelopemaker','labeller','tissuemaker','boardmaker','pulptrader','recycler','warehouse',
                    'terminal','depot','consolidator','packershipper','millagent','buyinghouse','sourcingoffice',
                    'groupbuyer','enduser'] as trade,
              array['Austria','Kenya','Peru','Poland','Vietnam'] as country)
     insert into core.entities (kind, canonical, mention_count, name_count, sighting_count, profile_md, search_text, attributes, stale)
     select 'party',
            p.head[1 + n % 20] || ' ' || p.tail[1 + (n / 20) % 10] || ' ' || upper(substr(md5(n::text), 1, 8)) || ' PTE LTD',
            0, 1, 1,
            '# ' || p.head[1 + n % 20] || ' ' || n || chr(10) || 'A party.' || chr(10) || chr(10) ||
              'A ' || p.trade[1 + n % 40] || ' seen as a consignee.' || chr(10) || chr(10) ||
              '## What our mail shows' || chr(10) || 'Seen as a consignee.' || chr(10) || chr(10) ||
              '## General knowledge, unverified (confidence 0.50)' || chr(10) ||
              'A ' || p.trade[1 + n % 40] || ' in ' || p.country[1 + n % 5] || '.',
            p.head[1 + n % 20] || ' ' || p.tail[1 + (n / 20) % 10] || ' ' || upper(substr(md5(n::text), 1, 8)) || ' ' || p.trade[1 + n % 40],
            jsonb_build_object('country', p.country[1 + n % 5], 'kind', p.trade[1 + n % 40]),
            false
       from generate_series(1, $1::int) as n, pool p`,
    [ENTITIES],
  );
  await client.query(
    `insert into core.entity_names (entity_id, value, seen_count, joined_by)
     select id, canonical, 1, 'kept' from core.entities where id > $1::bigint`,
    [before],
  );
  await client.query(
    // Numbered by row rather than by id: a rolled-back run still spends
    // sequence values, so the ids these rows were given are not contiguous and
    // arithmetic on them joins to nothing.
    `with bench as (
       select id, canonical, (row_number() over (order by id)) - 1 as k
         from core.entities where id > $3::bigint)
     insert into core.entity_sightings (entity_id, email_id, role, source, surface, source_quote)
     select b.id, 'bench_' || (1 + (n / 5000)), 'consignee', 'body', b.canonical, 'Consignee: ' || b.canonical
       from generate_series(0, $1::int - 1) as n
       join bench b on b.k = n % $2::int`,
    [APPEARANCES, ENTITIES, before],
  );
  await client.query("analyze core.entities");
  await client.query("analyze core.entity_names");
  await client.query("analyze core.entity_sightings");
  console.log(`filled in ${((Date.now() - filling) / 1000).toFixed(1)} s`);

  // One full pass, exactly as the scheduler runs it. This is the number that
  // decides whether the incremental form in the spec's Deferred section is
  // worth building.
  const started = Date.now();
  const mentions = await entityInputs.loadMentions(client);
  const verdicts = await entityInputs.loadVerdicts(client);
  const joins = await entityInputs.loadResolveJoins(client);
  const sightings = await entityInputs.loadSightings(client);
  const existing = await entityInputs.loadExisting(client);
  const loaded = Date.now();
  const resolved = resolveEntities(mentions, [...verdicts, ...joins], sightings);
  const plan = reconcile(resolved, existing);
  const planned = Date.now();
  console.log(
    `resolveAll: loaded ${sightings.length.toLocaleString()} sightings in ${((loaded - started) / 1000).toFixed(1)} s, ` +
      `resolved and planned ${resolved.length.toLocaleString()} things in ${((planned - loaded) / 1000).toFixed(1)} s ` +
      `(keep ${plan.keep.length}, insert ${plan.insert.length}, merge ${plan.merge.length}, drop ${plan.drop.length})`,
  );
  void entityResolution;

  const some = (await client.query<{ id: string; canonical: string }>(
    "select id::text as id, canonical from core.entities where id > $2::bigint order by id offset $1::int limit 1",
    [Math.floor(ENTITIES / 2), before],
  )).rows[0];
  const name = some.canonical;
  const someId = some.id;
  const conceptId = (
    await client.query<{ id: string }>(
      `insert into core.concepts (entity_kind, phrase, definition) values ('party', 'a distributor', 'a company that buys to resell')
       returning id::text as id`,
    )
  ).rows[0].id;
  await client.query(
    `insert into core.concept_verdicts (concept_id, entity_id, verdict, confidence, rationale, profile_version)
     select $1::bigint, id, 'yes', 0.9, 'its profile says distributor', 0
       from core.entities where id > $2::bigint limit 50000`,
    [conceptId, before],
  );
  await client.query("analyze core.concept_verdicts");

  const checks = [
    await measure(client, "spelling lookup", "select n.entity_id, n.value from core.entity_names n where lower(n.value) = any($1::text[])", [[name.toLowerCase()]]),
        await measure(
      client,
      "nearest spellings",
      "select entity_id, value from core.entity_names order by value operator(public.<->) $1::text limit 50",
      [name],
    ),
    await measure(
      client,
      "ranked candidates",
      `select id from core.entities
        where kind = 'party' and merged_into is null and search @@ websearch_to_tsquery('simple', $1::text)
        order by ts_rank(search, websearch_to_tsquery('simple', $1::text)) desc, id
        limit 400`,
      ["distributor"],
    ),
    await measure(
      client,
      "topping the list up",
      `select id from core.entities
        where kind = 'party' and merged_into is null
        order by (mention_count + sighting_count) desc, id
        limit 400`,
      [],
    ),
    await measure(
      client,
      "the join a question makes",
      `select count(*) from core.entity_sightings s
        where s.entity_id in (select entity_id from core.concept_verdicts where concept_id = $1::bigint and matched)
          and s.entity_id = $2::bigint`,
      [conceptId, someId],
    ),
  ];

  console.log("");
  for (const check of checks) {
    const ok = check.indexed && check.ms <= BUDGET_MS;
    if (!ok) failures += 1;
    console.log(`${ok ? "ok  " : "FAIL"}  ${check.what.padEnd(24)} ${check.ms.toFixed(1).padStart(8)} ms  ${check.indexed ? "indexed" : "SEQUENTIAL SCAN"}`);
    if (!ok) console.log(check.plan.split("\n").slice(0, 8).map((line) => `        ${line}`).join("\n"));
  }
} finally {
  // Always. Nothing this script inserted is meant to outlive it.
  await client.query("rollback");
  client.release();
  await closePool();
  await closeRoPool();
}

if (failures > 0) {
  console.error(`\n${failures} of 4 lookups are over the ${BUDGET_MS} ms budget or not using an index.`);
  process.exitCode = 1;
}
