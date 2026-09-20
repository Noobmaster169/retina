import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * Substitutes `:'name'` with a single-quoted literal, the way psql does.
 *
 * Only 011_ro_role.sql uses it, and only for PG_RO_PASSWORD: a password cannot
 * be in git and CREATE ROLE takes no bind parameter. A file that names a
 * placeholder whose variable is unset fails loudly rather than applying a
 * migration with the literal `:'ro_password'` as the password.
 */
const SUBSTITUTIONS = { ro_password: "PG_RO_PASSWORD" };

function substitute(filename, sql) {
  return sql.replace(/:'([a-z_]+)'/g, (match, name) => {
    const variable = SUBSTITUTIONS[name];
    if (!variable) throw new Error(`${filename} names :'${name}', which db/migrate.mjs does not know`);
    const value = process.env[variable];
    if (!value) throw new Error(`${filename} needs ${variable}, which is not set`);
    return `'${value.replaceAll("'", "''")}'`;
  });
}

/**
 * Applies every migration not yet recorded in schema_migrations, in filename
 * order. Each file runs in a transaction together with its bookkeeping insert,
 * so a failing migration leaves nothing half-applied.
 *
 * A single Client rather than the app's Pool: this runs as a one-shot script,
 * and DDL wants one connection with no pooling surprises.
 */
export async function migrate({ log = console.log } = {}) {
  const client = new Client({
    host: required("PG_HOST"),
    port: Number(process.env.PG_PORT ?? "5432"),
    database: required("PG_DATABASE"),
    user: required("PG_USER"),
    password: required("PG_PASSWORD"),
  });

  await client.connect();
  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename   text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const { rows } = await client.query("select filename from schema_migrations");
    const done = new Set(rows.map((row) => row.filename));

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const pending = files.filter((name) => !done.has(name));

    if (pending.length === 0) {
      log("Database is up to date.");
      return [];
    }

    for (const filename of pending) {
      const sql = substitute(filename, await readFile(join(MIGRATIONS_DIR, filename), "utf8"));
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into schema_migrations (filename) values ($1)",
          [filename],
        );
        await client.query("commit");
        log(`Applied ${filename}`);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Migration ${filename} failed: ${error.message}`, {
          cause: error,
        });
      }
    }

    return pending;
  } finally {
    await client.end();
  }
}

// Only self-executes when run as a script, so tests can import migrate().
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
