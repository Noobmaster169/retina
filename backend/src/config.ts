import { z } from "zod";

/** An env var left empty in .env is the same as one that is not there. */
const optionalString = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8091),

  PG_HOST: z.string().min(1),
  PG_PORT: z.coerce.number().int().positive().default(5432),
  PG_DATABASE: z.string().min(1),
  PG_USER: z.string().min(1),
  PG_PASSWORD: z.string().min(1),

  // Where the chat agent's SQL runs: the `retina_ro` role of migration 011,
  // which holds no write privilege, defaults its transactions to read only and
  // times a statement out at 5 s. A URL rather than another set of PG_* vars
  // because it is a different principal, not a different setting, and one
  // string makes that obvious.
  //
  // Optional, on the same argument as Redis and MinIO: the api must still boot
  // where the role does not exist yet and say so, rather than refusing to
  // serve the inbox because the chat cannot answer. run_sql fails with a
  // terminal error naming this variable when it is unset.
  DATABASE_RO_URL: z.url().optional(),

  // Redis and MinIO have defaults and optional credentials on purpose: the
  // api must still boot where they do not exist yet (the VPS until phase 3)
  // and say so in /health, rather than take the inbox down with it.
  REDIS_URL: z.url().default("redis://127.0.0.1:6379"),
  MINIO_ENDPOINT: z.string().min(1).default("127.0.0.1:9000"),
  MINIO_ACCESS_KEY: optionalString,
  MINIO_SECRET_KEY: optionalString,
  MINIO_BUCKET: z.string().min(1).default("retina"),
  MINIO_USE_SSL: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  EMAIL_SERVER_URL: z.url(),
  // The llm-proxy service of the compose stack. 4001 is where compose.local.yaml
  // publishes it on the host; inside compose it is http://llm-proxy:4000.
  LLM_PROXY_URL: z.url().default("http://127.0.0.1:4001"),

  // The doc-extract service of the compose stack. 8000 is where compose.local.yaml
  // publishes it on the host; inside compose it is http://doc-extract:8000.
  DOC_EXTRACT_URL: z.url().default("http://127.0.0.1:8000"),

  // Either key may be unset, in which case that caller cannot authenticate.
  API_SHARED_SECRET: optionalString,
  TEAM_API_KEY: optionalString,

  // The answer key, for the eval harness only. Set on a dev machine, never on
  // the VPS: there the key exists only inside the inbox container.
  EVAL_GROUND_TRUTH_PATH: optionalString,

  // Every LLM step runs the model its prompt file names, which is sonnet. This
  // replaces it for an experiment; it must be an alias from proxy/proxy.yaml.
  LLM_MODEL_CLASSIFY: optionalString,
  LLM_MODEL_VERIFY: optionalString,
  LLM_MODEL_TRIAGE: optionalString,
  LLM_MODEL_DOC_TYPE: optionalString,
  LLM_MODEL_EXTRACT: optionalString,
  LLM_MODEL_EXTRACT_VERIFY: optionalString,
  LLM_MODEL_FIELD_JUDGE: optionalString,
  LLM_MODEL_CHAT: optionalString,
  LLM_MODEL_SHIPMENT_READ: optionalString,
  LLM_MODEL_ENTITY_RESOLVE: optionalString,
  LLM_MODEL_ENTITY_PROFILE: optionalString,
  LLM_MODEL_CONCEPT_DEFINE: optionalString,
  LLM_MODEL_CONCEPT_JUDGE: optionalString,
  // How many model calls the worker has in flight at once, across every queue.
  //
  // Unset, it is CLASSIFY_CONCURRENCY plus COMPARE_CONCURRENCY, because that
  // is how many scored jobs BullMQ runs at once and all of them contend for
  // these slots. The ontology queue is deliberately left out of the sum: its
  // jobs take the same semaphore and so wait behind scored work, which is the
  // whole point of a queue that must never slow an email down. It used to follow CLASSIFY_CONCURRENCY alone, which meant
  // eight classify jobs could hold every slot while four compare jobs sat
  // blocked in the semaphore: on the run page, sorting unaffected and checking
  // paused, with nothing anywhere saying why.
  //
  // Keep it at or under what the proxy serves at once (max_concurrency in
  // proxy/proxy.yaml): more only wait inside the proxy with their request
  // timeout already running.
  LLM_MAX_CONCURRENCY: z.coerce.number().int().positive().optional(),
  // How much of a body the classifier reads. A cost guard, not a judgement.
  CLASSIFY_BODY_CHARS: z.coerce.number().int().positive().default(4000),
  // How much of each attachment's extracted text a classifier that reads attachments sees. The same kind of guard.
  CLASSIFY_ATTACHMENT_CHARS: z.coerce.number().int().positive().default(2000),
  // How much of a document the doc-type step reads. A shipping document is a page or two; this is the same kind of guard.
  DOC_TYPE_TEXT_CHARS: z.coerce.number().int().positive().default(12_000),
  // How much of a document the extractor and its verifier read. The same guard; no generated document comes near it.
  EXTRACT_TEXT_CHARS: z.coerce.number().int().positive().default(12_000),
  // How much of an email and its documents the shipment reader sees. The same kind of guard.
  SHIPMENT_TEXT_CHARS: z.coerce.number().int().positive().default(14_000),

  /**
   * Whether an entity profile may carry what the model knows from training.
   *
   * `mail+model` writes a `general` section beside the `observed` one, marked
   * unverified with a confidence of its own, and it is what makes "ports in
   * Asia" answerable without the word Asia appearing in any email. It does not
   * contradict CHAT.md's rule that the agent may relate and never report: a
   * profile's `general` is a claim about the world, carries that label
   * wherever it is shown, and is never a fact about this mailbox.
   *
   * `mail` leaves it null everywhere. A person's profile has no `general`
   * under either setting: what a model believes about a named individual is
   * not something this system stores.
   */
  ONTOLOGY_KNOWLEDGE: z.enum(["mail", "mail+model"]).default("mail+model"),

  /**
   * Starting values, all of them. Measure before moving one: the ontology
   * question set is what says whether a change helped.
   *
   * JUDGE_BUDGET is how many profiles one question may have judged in its own
   * turn, JUDGE_BATCH how many go in one call, CANDIDATE_CAP how many ids a
   * narrowing query may return, PROFILE_BATCH how many stale things one
   * scheduler tick rewrites, and PROFILE_FLOOR_HOURS how long a profile is
   * left alone after being written.
   */
  JUDGE_BUDGET: z.coerce.number().int().positive().default(400),
  JUDGE_BATCH: z.coerce.number().int().positive().default(40),
  CANDIDATE_CAP: z.coerce.number().int().positive().default(5000),
  PROFILE_BATCH: z.coerce.number().int().positive().default(50),
  PROFILE_FLOOR_HOURS: z.coerce.number().int().nonnegative().default(24),
  /**
   * How long a maintenance pass may hold an ontology slot before it stops and
   * leaves the rest to the next tick.
   *
   * A profile call takes tens of seconds and a batch is fifty of them, so
   * without this one pass would hold half the queue for half an hour and no
   * email's reading would run in that time. Four minutes against a ten minute
   * tick leaves the queue free most of the time and still gets through the
   * batch over a few ticks.
   */
  MAINTENANCE_BUDGET_MS: z.coerce.number().int().positive().default(240_000),

  // The proxy serves twelve `claude -p` calls at a time (max_concurrency in proxy/proxy.yaml),
  // which is these two added up, because that is how many scored jobs run at once. More workers
  // than that only queue inside the proxy with their request timeout already running.
  /**
   * The admission gate in front of the pipeline.
   *
   * `observe` is the default and it holds nothing an automatic rule decided:
   * it reaches every verdict, charges every bucket and records every row, then
   * admits the email anyway, so a person can see what the gate would have done
   * to real traffic before letting it do it. A blacklist a person set bites in
   * `observe` too, because that is a decision and not a guess.
   *
   * It matters that this is not `enforce`. The Averis replay is 520 emails
   * from fifteen domains, every one of them an unknown sender on its first
   * day, and a live gate would hold most of a demo.
   */
  GATE_MODE: z.enum(["off", "observe", "enforce"]).default("observe"),
  /**
   * What a day of model calls may cost before the gate starts refusing by
   * standing: at 0.8 of it an unknown or new sender waits, past it only
   * established and whitelisted senders are served. Read from the cost_usd
   * already in core.llm_calls, so it measures what was actually spent.
   *
   * It degrades rather than stopping: an attacker whose flood stops your real
   * customers has achieved the outage they were paying for.
   */
  GATE_DAILY_BUDGET_USD: z.coerce.number().positive().default(25),
  /** The bucket no sender can rotate around, in the same units as every other one. */
  GATE_GLOBAL_BURST: z.coerce.number().int().positive().default(4000),
  GATE_GLOBAL_DAILY: z.coerce.number().int().positive().default(60_000),
  /** How long an empty burst bucket takes to refill. Its capacity divided by this is the sustained rate. */
  GATE_BURST_REFILL_SECONDS: z.coerce.number().int().positive().default(600),

  CLASSIFY_CONCURRENCY: z.coerce.number().int().positive().default(8),
  COMPARE_CONCURRENCY: z.coerce.number().int().positive().default(4),
  // The semantic layer's own queue. Small on purpose: it runs after an email's
  // verdict is written, it must never slow a scored email, and it takes the
  // LLM semaphore at the lowest priority.
  ONTOLOGY_CONCURRENCY: z.coerce.number().int().positive().default(2),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),

  // The commit this image was built from, passed as a build arg by the
  // Dockerfile. "dev" outside a built image, which is exactly what a local
  // process is. /health reports it so a deploy can be told apart from a
  // rollback without reading the box's logs.
  GIT_SHA: z.string().min(1).default("dev"),
}).superRefine((env, ctx) => {
  // The proxy is a service of this stack now. An .env from before still names
  // another API's /ai/chat, which this backend no longer speaks to: every call
  // would fail as a malformed request. Refuse to boot and say what to use.
  if (/\/ai\/chat\/?$/.test(env.LLM_PROXY_URL)) {
    ctx.addIssue({
      code: "custom",
      path: ["LLM_PROXY_URL"],
      message:
        "names a remote /ai/chat gateway, which is gone: point it at the llm-proxy container " +
        "(http://127.0.0.1:4001 from the host with compose.local.yaml, http://llm-proxy:4000 inside compose)",
    });
  }
})
  .transform((env) => ({
    ...env,
    LLM_MAX_CONCURRENCY: env.LLM_MAX_CONCURRENCY ?? env.CLASSIFY_CONCURRENCY + env.COMPARE_CONCURRENCY,
  }));

export type Config = z.infer<typeof Env>;

function load(): Config {
  const parsed = Env.safeParse(process.env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment:\n  ${problems.join("\n  ")}`);
}

export const config = load();
