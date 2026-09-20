import { config } from "../src/config";
import { getPool, closePool } from "../src/db";
import { childLogger } from "../src/lib/logger";

/**
 * Starts a burst run and watches it to the end, then says what it cost.
 *
 * A burst, not a paced run, because a burst is the shape that hurts: every
 * email lands in `classify` at once, and whether `compare` ever gets a model
 * slot is exactly the question phase 9 is about.
 *
 * It reads the api over HTTP like anything else would, and reads the ledger
 * directly for the numbers a poll cannot see. The peak overlap in particular
 * is computed from `llm_calls` rather than from the semaphore's own counter:
 * the semaphore saying it never exceeded its cap is the semaphore marking its
 * own work, while the ledger is what actually happened.
 *
 *   pnpm load-test                  # every email, rate 0
 *   pnpm load-test --limit 40       # a smaller burst while developing
 */

const log = childLogger({ module: "load-test" });

const POLL_MS = 3000;
/** A burst of 520 at roughly half a request a second is hours, not minutes. */
const GIVE_UP_AFTER_MS = 6 * 60 * 60 * 1000;

interface Options {
  limit: number | null;
}

function options(argv: string[]): Options {
  const at = argv.indexOf("--limit");
  return { limit: at === -1 ? null : Number(argv[at + 1]) };
}

function apiKey(): string {
  const key = config.TEAM_API_KEY;
  if (!key) throw new Error("TEAM_API_KEY is not set; the load test talks to the api as a caller would");
  return key;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${config.PORT}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${apiKey()}`, "content-type": "application/json", ...init.headers },
  });
  if (!response.ok) throw new Error(`${path} answered ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

interface RunView {
  id: string;
  status: string;
  processingDone: boolean;
  queues: { classify: { waiting: number; active: number }; compare: { waiting: number; active: number } } | null;
}

/** Waits for the pipeline to finish, not for ingest: `status` goes `completed` the moment the last email is enqueued. */
async function watch(runId: string): Promise<{ elapsedMs: number; peakDepth: number }> {
  const started = Date.now();
  let peakDepth = 0;

  for (;;) {
    const run = await api<RunView>(`/runs/${runId}`);
    const depth = run.queues
      ? run.queues.classify.waiting + run.queues.classify.active + run.queues.compare.waiting + run.queues.compare.active
      : 0;
    peakDepth = Math.max(peakDepth, depth);

    if (run.processingDone) return { elapsedMs: Date.now() - started, peakDepth };
    if (Date.now() - started > GIVE_UP_AFTER_MS) throw new Error(`run ${runId} did not finish within the budget`);

    log.info({ runId, status: run.status, depth, elapsedS: Math.round((Date.now() - started) / 1000) }, "waiting");
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/**
 * The most model calls that were ever in flight at once, from the ledger.
 *
 * A call's window is [created_at - latency_ms, created_at]. Sorting every
 * start as +1 and every end as -1 and sweeping gives the true overlap, which
 * is the independent check on `LLM_MAX_CONCURRENCY`: the semaphore cannot
 * report a violation of its own cap, and this can.
 */
async function peakOverlap(runId: string): Promise<number> {
  const { rows } = await getPool().query<{ at: string; delta: string }>(
    `select at, delta from (
       select extract(epoch from created_at) * 1000 - latency_ms as at, 1 as delta
         from core.llm_calls where run_id = $1
       union all
       select extract(epoch from created_at) * 1000 as at, -1 as delta
         from core.llm_calls where run_id = $1
     ) events order by at, delta desc`,
    [runId],
  );

  let inFlight = 0;
  let peak = 0;
  for (const row of rows) {
    inFlight += Number(row.delta);
    peak = Math.max(peak, inFlight);
  }
  return peak;
}

/** A 429 from the proxy means the burst outran what it serves. Zero of them is the exit checklist's line. */
async function rateLimited(runId: string): Promise<number> {
  const { rows } = await getPool().query<{ n: string }>(
    "select count(*) as n from core.llm_calls where run_id = $1 and error like '%429%'",
    [runId],
  );
  return Number(rows[0].n);
}

const { limit } = options(process.argv.slice(2));
const run = await api<RunView>("/runs", {
  method: "POST",
  body: JSON.stringify({ ratePerSecond: 0, ...(limit ? { limit } : {}) }),
});
log.info(
  { runId: run.id, limit: limit ?? "every email", classify: config.CLASSIFY_CONCURRENCY, compare: config.COMPARE_CONCURRENCY, llm: config.LLM_MAX_CONCURRENCY },
  "burst started",
);

const { elapsedMs, peakDepth } = await watch(run.id);
const [peak, throttled] = await Promise.all([peakOverlap(run.id), rateLimited(run.id)]);

log.info(
  {
    runId: run.id,
    elapsedS: Math.round(elapsedMs / 1000),
    peakQueueDepth: peakDepth,
    peakCallsInFlight: peak,
    llmMaxConcurrency: config.LLM_MAX_CONCURRENCY,
    withinCap: peak <= config.LLM_MAX_CONCURRENCY,
    rateLimited: throttled,
  },
  "burst finished",
);

await closePool();
// A peak above the cap is the one result worth failing on: it means the
// semaphore is not the thing deciding how many calls are in flight.
process.exit(peak <= config.LLM_MAX_CONCURRENCY && throttled === 0 ? 0 : 1);
