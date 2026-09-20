/**
 * What a model-written query is allowed to be.
 *
 * The second line of defence, not the first. `retina_ro` holds no write
 * privilege, defaults its transactions to read only and times a statement out
 * at five seconds, so a query that got past everything here still cannot
 * change a row or hold a connection. This exists because a clear refusal with
 * a reason is a better answer than a permission error the model cannot learn
 * from, and because two independent stops is the right number when one of them
 * is a regex over text a model wrote.
 *
 * Pure: a string in, a verdict out. No database, no config, no io.
 *
 * Every ambiguity resolves towards refusal. A banned word inside a string
 * literal is refused, and a `;` inside one is refused, because distinguishing
 * them needs a real parser and a wrong guess in the other direction is the
 * only one that costs anything.
 */

/** Rows past this are dropped before the model or the page sees them, whatever the query asked for. */
export const MAX_ROWS = 200;

/** A result bigger than this is cut, because a model that reads 200 kB of JSON answers worse, not better. */
export const MAX_RESULT_BYTES = 20_000;

/**
 * Words a read-only query has no use for.
 *
 * `create`, `refresh` and `set` are here even though the role could not run
 * them: a refusal naming the word teaches the model more than a privilege
 * error. `copy` and the `pg_read_file` family read and write the server's
 * filesystem. `pg_sleep` and `dblink` are the two ways to make a SELECT do
 * something a SELECT should not.
 */
const BANNED = [
  "insert", "update", "delete", "merge", "truncate", "drop", "alter", "create", "grant", "revoke",
  "comment", "refresh", "vacuum", "analyze", "cluster", "reindex", "lock", "copy", "call", "do",
  "set", "reset", "listen", "notify", "unlisten", "prepare", "execute", "declare", "fetch", "move",
  "begin", "commit", "rollback", "savepoint", "discard", "explain", "pg_sleep", "dblink",
  "pg_read_file", "pg_read_binary_file", "pg_ls_dir", "pg_stat_file", "lo_import", "lo_export",
  "pg_terminate_backend", "pg_cancel_backend", "pg_reload_conf",
];

const BANNED_PATTERN = new RegExp(`\\b(${BANNED.join("|")})\\b`, "i");

/** A `limit` that governs the whole query sits at the very end, optionally followed by an offset. */
const TRAILING_LIMIT = /\blimit\s+\d+\s*(?:offset\s+\d+\s*)?$/i;

export type SqlVerdict =
  | { ok: true; sql: string; limitAdded: boolean }
  | { ok: false; reason: string };

/**
 * Removes `--` line comments and `/* *\/` block comments.
 *
 * Runs before every other check, because a comment is the obvious way to hide
 * a second statement. It does not know about string literals, so a query with
 * `--` inside one comes out mangled and then fails to parse in Postgres, which
 * is a worse error message and a fine outcome for a query nothing legitimate
 * needs to write.
 */
export function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

export function guardSql(raw: string): SqlVerdict {
  const bare = stripComments(raw).trim();
  if (bare.length === 0) return { ok: false, reason: "the query is empty" };

  // One trailing semicolon is ordinary; a second statement is not. Stripping
  // exactly one and then refusing any that remain is the whole rule.
  const body = bare.replace(/;\s*$/, "").trim();
  if (body.includes(";")) {
    return { ok: false, reason: "only one statement per query, and a `;` inside it is refused" };
  }
  if (body.length === 0) return { ok: false, reason: "the query is empty" };

  if (!/^(select|with)\b/i.test(body)) {
    return { ok: false, reason: "a query must start with `select` or `with`; this one does not read, it does something else" };
  }

  const banned = BANNED_PATTERN.exec(body);
  if (banned) {
    return { ok: false, reason: `\`${banned[1].toLowerCase()}\` is not allowed: this connection may only read` };
  }

  const hasLimit = TRAILING_LIMIT.test(body);
  return { ok: true, sql: hasLimit ? body : `${body} limit ${MAX_ROWS}`, limitAdded: !hasLimit };
}
