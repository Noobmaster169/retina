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
  // How much of a body the classifier reads. A cost guard, not a judgement.
  CLASSIFY_BODY_CHARS: z.coerce.number().int().positive().default(4000),

  CLASSIFY_CONCURRENCY: z.coerce.number().int().positive().default(4),
  COMPARE_CONCURRENCY: z.coerce.number().int().positive().default(4),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
});

export type Config = z.infer<typeof Env>;

function load(): Config {
  const parsed = Env.safeParse(process.env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment:\n  ${problems.join("\n  ")}`);
}

export const config = load();
