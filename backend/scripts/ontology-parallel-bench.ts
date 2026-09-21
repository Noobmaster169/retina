// node --env-file-if-exists=.env --import tsx scripts/ontology-parallel-bench.ts \
//   --label c10 --concurrency 10 [--emails 40] [--out /path/snapshot.json]
//
// Reads a stratified sample of finished emails through the real `processOntology`
// at a fixed concurrency and writes what it produced, so two settings can be
// compared for speed and for whether they built the same graph.
//
// It writes to whichever database PG_DATABASE names. Point it at a scratch clone,
// never the dev database: the reading replaces an email's rows. Spends model
// calls, on whatever LLM_MODEL_SHIPMENT_READ and LLM_MODEL_ENTITY_RESOLVE name.

import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { proxyLlmClient } from "../src/agents";
import { config } from "../src/config";
import { closePool, getPool, transactor } from "../src/db";
import { shipments } from "../src/ontology/repositories";
import { processOntology } from "../src/queues/processors/ontology.processor";
import { createMinioStore } from "../src/storage";

const { values } = parseArgs({
  options: {
    label: { type: "string" },
    concurrency: { type: "string", default: "1" },
    emails: { type: "string", default: "40" },
    out: { type: "string" },
    // Exactly these emails, instead of a sample. The cached-reading runs use it to repeat what a serial run read.
    ids: { type: "string" },
    // Write the snapshot of what the database holds now and process nothing.
    "snapshot-only": { type: "boolean", default: false },
    "max-id-before": { type: "string" },
    // Regroup the shipments this often while the readings run, as the scheduler's per-minute task does beside the
    // ontology queue, and once more at the end. Without it the shipments are not built at all.
    "regroup-every-ms": { type: "string" },
    // Build the shipments once from what the database holds now. For a database a run finished in before they existed.
    "regroup-final": { type: "boolean", default: false },
  },
});
const concurrency = Number(values.concurrency);
const wanted = Number(values.emails);
const ATTEMPTS = 3;

interface Job {
  emailId: string;
  emailRunId: number;
  category: string;
}

const pool = getPool();

/** Every category represented in the mailbox's own proportions, spread evenly through each so the sample is not one stretch of ids. */
async function sample(): Promise<Job[]> {
  if (values["snapshot-only"]) return [];
  if (values.ids) {
    const found = await pool.query<{ email_id: string; id: string; category: string }>(
      `select distinct on (er.email_id) er.email_id, er.id::text as id, coalesce(c.final_category, 'UNKNOWN') as category
         from core.email_runs er left join core.classifications c on c.email_run_id = er.id
        where er.email_id = any($1::text[]) order by er.email_id, er.id desc`,
      [values.ids.split(",")],
    );
    return found.rows.map((row) => ({ emailId: row.email_id, emailRunId: Number(row.id), category: row.category }));
  }
  const { rows } = await pool.query<{ email_id: string; id: string; category: string }>(
    `select distinct on (er.email_id) er.email_id, er.id::text as id, coalesce(c.final_category, 'UNKNOWN') as category
       from core.email_runs er
       left join core.classifications c on c.email_run_id = er.id
      where er.stage in ('done', 'review')
        and not exists (select 1 from core.email_shipments s where s.email_id = er.email_id)
      order by er.email_id, er.id desc`,
  );
  const byCategory = new Map<string, Job[]>();
  for (const row of rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push({ emailId: row.email_id, emailRunId: Number(row.id), category: row.category });
    byCategory.set(row.category, list);
  }
  const picked: Job[] = [];
  for (const list of byCategory.values()) {
    const take = Math.max(1, Math.round((wanted * list.length) / rows.length));
    for (let i = 0; i < take && i < list.length; i++) picked.push(list[Math.floor((i * list.length) / take)]);
  }
  return picked.sort((a, b) => a.emailId.localeCompare(b.emailId));
}

interface Outcome {
  emailId: string;
  category: string;
  startMs: number;
  endMs: number;
  attempts: number;
  errors: string[];
}

async function main(): Promise<void> {
  const jobs = await sample();
  const llm = proxyLlmClient({ maxConcurrency: 20 });
  const deps = { pool, llm, store: createMinioStore(), tx: transactor(pool) };
  const before = await pool.query<{ max: string | null }>("select max(id)::text as max from core.entities");
  const maxBefore = Number(values["max-id-before"] ?? before.rows[0].max ?? 0);
  const started = values["snapshot-only"] ? new Date(0) : new Date();
  const t0 = performance.now();
  const outcomes: Outcome[] = [];
  const queue = [...jobs];

  async function work(): Promise<void> {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const outcome: Outcome = { emailId: job.emailId, category: job.category, startMs: performance.now() - t0, endMs: 0, attempts: 0, errors: [] };
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        outcome.attempts = attempt;
        try {
          await processOntology(deps, { emailId: job.emailId, emailRunId: job.emailRunId });
          break;
        } catch (error) {
          const code = (error as { code?: string }).code;
          outcome.errors.push(`${code ?? "-"} ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`);
          // The queue's own backoff, shortened: what is measured is whether a retry happens, not how long it waits.
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
      outcome.endMs = performance.now() - t0;
      outcomes.push(outcome);
    }
  }
  const regroupEvery = Number(values["regroup-every-ms"] ?? 0);
  const regroups: { ms: number; error: string | null }[] = [];
  const regroupOnce = async (): Promise<void> => {
    const began = performance.now();
    try {
      await shipments.regroupAll(pool);
      regroups.push({ ms: performance.now() - began, error: null });
    } catch (error) {
      regroups.push({ ms: performance.now() - began, error: `${(error as { code?: string }).code ?? "-"} ${error instanceof Error ? error.message.slice(0, 100) : String(error)}` });
    }
  };
  let working = true;
  const regrouping = (async () => {
    while (regroupEvery > 0 && working) {
      await regroupOnce();
      await new Promise((resolve) => setTimeout(resolve, regroupEvery));
    }
  })();
  await Promise.all(Array.from({ length: concurrency }, work));
  working = false;
  await regrouping;
  const wallS = (performance.now() - t0) / 1000;
  if (regroupEvery > 0 || values["regroup-final"]) await regroupOnce();

  const calls = await pool.query(
    `select step, count(*)::int as n, count(*) filter (where not ok)::int as failed,
            round(avg(latency_ms))::int as avg_ms, round(sum(latency_ms)/1000.0)::int as total_s
       from core.llm_calls where created_at >= $1 and step in ('shipment-read', 'entity-resolve')
      group by step order by step`,
    [started],
  );
  const graph = {
    entities: (await pool.query("select id::text, kind, canonical, name_count from core.entities where merged_into is null order by id")).rows,
    names: (await pool.query("select entity_id::text, value, joined_by from core.entity_names order by entity_id, value")).rows,
    sightings: (
      await pool.query("select email_id, role, source, surface, entity_id::text from core.entity_sightings order by email_id, role, source, surface")
    ).rows,
    shipments: (
      await pool.query(
        `select email_id, shipper_id::text, consignee_id::text, notify_party_id::text, pol_id::text, pod_id::text,
                carrier_id::text, vessel_id::text, commodity_id::text from core.email_shipments order by email_id`,
      )
    ).rows,
  };
  const groups = (
    await pool.query(
      `select key, refs, email_count, shipper_id::text, consignee_id::text, notify_party_id::text, pol_id::text, pod_id::text,
              carrier_id::text, vessel_id::text, commodity_id::text
         from core.shipments order by key`,
    )
  ).rows;
  const dups = await pool.query(
    `select a.kind, a.canonical as a, b.canonical as b, round(public.similarity(a.canonical, b.canonical)::numeric, 2)::text as sim
       from core.entities a join core.entities b on a.kind = b.kind and a.id < b.id
      where a.merged_into is null and b.merged_into is null and public.similarity(a.canonical, b.canonical) >= 0.8
      order by sim desc`,
  );

  const created = graph.entities.filter((row: { id: string }) => Number(row.id) > maxBefore);
  const kinds = (rows: { kind: string }[]) => Object.fromEntries([...new Set(rows.map((r) => r.kind))].sort().map((k) => [k, rows.filter((r) => r.kind === k).length]));
  const failed = outcomes.filter((o) => o.errors.length > 0);
  const summary = {
    label: values.label,
    concurrency,
    model: { read: config.LLM_MODEL_SHIPMENT_READ ?? "prompt default", resolve: config.LLM_MODEL_ENTITY_RESOLVE ?? "prompt default" },
    emails: outcomes.length,
    wallS: Number(wallS.toFixed(1)),
    emailsPerMin: Number(((outcomes.length / wallS) * 60).toFixed(1)),
    retried: failed.length,
    gaveUp: outcomes.filter((o) => o.attempts === ATTEMPTS && o.errors.length === ATTEMPTS).length,
    errors: failed.flatMap((o) => o.errors.map((e) => e.slice(0, 90))),
    calls: calls.rows,
    regroup: { runs: regroups.length, errors: regroups.filter((r) => r.error).map((r) => r.error), avgMs: Math.round(regroups.reduce((sum, r) => sum + r.ms, 0) / Math.max(1, regroups.length)), maxMs: Math.round(Math.max(0, ...regroups.map((r) => r.ms))), groups: groups.length },
    entitiesCreated: kinds(created),
    liveEntities: graph.entities.length,
    nearDuplicatePairs: dups.rowCount,
    duplicates: dups.rows.slice(0, 25),
  };
  console.log(JSON.stringify(summary, null, 1));
  if (values.out) writeFileSync(values.out, JSON.stringify({ summary, outcomes, graph: { ...graph, groups } }, null, 1));
}

try {
  await main();
} finally {
  await closePool();
}
