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
  LLM_PROXY_URL: z.url().default("http://127.0.0.1:4000"),

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
  // How many model calls the worker has in flight at once, across every queue. Unset, it follows
  // CLASSIFY_CONCURRENCY, so one number sets how parallel a run is. Keep both at or under what the
  // proxy serves at once (max_concurrency in proxy/proxy.yaml): more only wait inside the proxy
  // with their request timeout already running.
  LLM_MAX_CONCURRENCY: z.coerce.number().int().positive().optional(),
  // How much of a body the classifier reads. A cost guard, not a judgement.
  CLASSIFY_BODY_CHARS: z.coerce.number().int().positive().default(4000),

  // The proxy serves two `claude -p` calls at a time (max_concurrency in proxy/proxy.yaml). More
  // workers than that only queue inside the proxy with their request timeout already running.
  CLASSIFY_CONCURRENCY: z.coerce.number().int().positive().default(2),
  COMPARE_CONCURRENCY: z.coerce.number().int().positive().default(4),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
}).superRefine((env, ctx) => {
  // A `/ai/chat` URL is the gateway transport, and that door takes the team
  // bearer. Without the key every call is a 401, which reads as a request this
  // side got wrong and fails each email terminally: one unset variable quietly
  // burns a whole run. Refuse to boot instead.
  if (env.LLM_PROXY_URL.endsWith("/ai/chat") && !env.TEAM_API_KEY) {
    ctx.addIssue({
      code: "custom",
      path: ["TEAM_API_KEY"],
      message: "required when LLM_PROXY_URL names an /ai/chat gateway",
    });
  }
})
  .transform((env) => ({ ...env, LLM_MAX_CONCURRENCY: env.LLM_MAX_CONCURRENCY ?? env.CLASSIFY_CONCURRENCY }));

export type Config = z.infer<typeof Env>;

function load(): Config {
  const parsed = Env.safeParse(process.env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment:\n  ${problems.join("\n  ")}`);
}

export const config = load();
