/**
 * Whether the strings a query filters on came from the data or from a guess.
 *
 * The failure this exists for: asked about a company, the agent writes
 * `where canonical = 'April Paper Trading'`, the stored spelling is longer,
 * no rows come back, and "there are none" is reported as a finding. A prompt
 * cannot tell that empty result from a true one. This can: a literal is
 * grounded when the agent has been shown it, and ungrounded when the only
 * place it appears is the person's question.
 *
 * Pure: strings in, a verdict out. The one check that needs the database, a
 * literal that is exactly a stored identifier, belongs to the caller.
 */

export interface SqlLiteral {
  value: string;
  /** The word or operator just before the opening quote, lower-cased: `like`, `interval`, `=`. */
  before: string;
  /** The cast straight after the closing quote, lower-cased and without `::`, or null. */
  cast: string | null;
  /** The function whose argument list the literal sits in, lower-cased, or "" outside any call. */
  fn: string;
}

const WORD_BEFORE = /([a-z_]+|[~!*<>=]+)\s*\(?\s*$/i;
const CAST_AFTER = /^\s*::\s*([a-z_ ]+?)(?=[\s,);\]]|$)/i;

/** The name before the nearest parenthesis still open at the end of `head`. */
function enclosingFunction(head: string): string {
  let depth = 0;
  for (let at = head.length - 1; at >= 0; at--) {
    if (head[at] === ")") depth += 1;
    else if (head[at] === "(") {
      if (depth === 0) return (/([a-z_][a-z0-9_]*)\s*$/i.exec(head.slice(0, at))?.[1] ?? "").toLowerCase();
      depth -= 1;
    }
  }
  return "";
}

function closeQuoted(sql: string, from: number, escapes: boolean): number {
  let at = from;
  while (at < sql.length) {
    if (escapes && sql[at] === "\\") at += 2;
    else if (sql[at] === "'" && sql[at + 1] === "'") at += 2;
    else if (sql[at] === "'") return at;
    else at += 1;
  }
  return -1;
}

/**
 * Every string literal in a query, in order.
 *
 * A small tokenizer rather than a regex, because the two things a regex gets
 * wrong are exactly the two that matter: a doubled quote inside a value, and a
 * dollar-quoted body. Double-quoted identifiers are stepped over. Comments are
 * the caller's to strip first; `guardSql` already does.
 */
export function literalsIn(sql: string): SqlLiteral[] {
  const found: SqlLiteral[] = [];
  let at = 0;
  while (at < sql.length) {
    const char = sql[at];
    if (char === '"') {
      const end = sql.indexOf('"', at + 1);
      at = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (char === "$") {
      const tag = /^\$[a-z_]*\$/i.exec(sql.slice(at));
      if (tag) {
        const end = sql.indexOf(tag[0], at + tag[0].length);
        const stop = end === -1 ? sql.length : end;
        found.push({ value: sql.slice(at + tag[0].length, stop), before: "", cast: null, fn: "" });
        at = stop + tag[0].length;
        continue;
      }
    }
    if (char === "'") {
      const escapes = at > 0 && /e/i.test(sql[at - 1]) && !/[a-z0-9_]/i.test(sql[at - 2] ?? " ");
      const end = closeQuoted(sql, at + 1, escapes);
      const stop = end === -1 ? sql.length : end;
      const head = sql.slice(0, escapes ? at - 1 : at);
      found.push({
        value: sql.slice(at + 1, stop).replace(/''/g, "'"),
        before: (WORD_BEFORE.exec(head)?.[1] ?? "").toLowerCase(),
        cast: CAST_AFTER.exec(sql.slice(stop + 1))?.[1].trim().toLowerCase() ?? null,
        fn: enclosingFunction(head),
      });
      at = stop + 1;
      continue;
    }
    at += 1;
  }
  return found;
}

/** A search is exploration, which is the behaviour being asked for, so a pattern is never refused. */
const PATTERN_OPERATORS = new Set(["like", "ilike", "~", "~*", "!~", "!~*", "~~", "~~*", "to"]);

/** Functions whose text argument is a search or a format, never an equality on a stored name. */
const SEARCH_FUNCTIONS = new Set([
  "websearch_to_tsquery", "plainto_tsquery", "phraseto_tsquery", "to_tsquery", "to_tsvector", "ts_headline",
  "similarity", "word_similarity", "to_char", "to_date", "to_timestamp", "date_trunc", "date_part", "extract",
  "regexp_replace", "regexp_match", "regexp_matches", "split_part", "string_agg", "concat_ws", "format", "position", "strpos",
]);

/** Casts that make a literal a value of a type rather than a name someone might have misspelt. */
const TYPED_CASTS = /^(date|time|timestamp|timestamptz|timestamp with time zone|timestamp without time zone|interval|uuid|int|integer|bigint|smallint|numeric|real|double precision|boolean|bool|regclass)$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER = /^[+-]?\d+(\.\d+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}([ t]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(z|[+-]\d{2}(:?\d{2})?)?)?$/i;
const INTERVAL = /^\d+\s*(microsecond|millisecond|second|minute|hour|day|week|month|year|sec|min)s?$/i;
const DATE_FORMAT = /^(?=.*(yy|mm|dd|hh|mi|ss|mon|day|iw))[ymdhisqwontaz0-9 :\-\/.,"]+$/i;
const DATE_PARTS = new Set(["microseconds", "milliseconds", "second", "minute", "hour", "day", "week", "month", "quarter", "year", "decade", "century", "epoch", "dow", "doy", "isodow", "isoyear", "utc"]);

/** True when a literal cannot be a misremembered name, whatever the data holds. */
function harmless(literal: SqlLiteral): boolean {
  const value = literal.value.trim();
  if (!/[\p{L}\p{N}]/u.test(value)) return true;
  if (PATTERN_OPERATORS.has(literal.before) || literal.before === "interval") return true;
  if (SEARCH_FUNCTIONS.has(literal.fn)) return true;
  if (literal.cast !== null && TYPED_CASTS.test(literal.cast)) return true;
  if (UUID.test(value) || NUMBER.test(value) || DATE.test(value) || INTERVAL.test(value)) return true;
  return DATE_PARTS.has(value.toLowerCase()) || DATE_FORMAT.test(value);
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}_]/u.test(char);
}

/** Whether `needle` appears in `haystack` as a whole, not as part of a longer word. `AL` is not in `ALPHA`. */
export function shown(haystack: string, needle: string): boolean {
  if (needle.length === 0) return true;
  let from = haystack.indexOf(needle);
  while (from !== -1) {
    const startsClean = !isWordChar(needle[0]) || !isWordChar(haystack[from - 1]);
    const endsClean = !isWordChar(needle[needle.length - 1]) || !isWordChar(haystack[from + needle.length]);
    if (startsClean && endsClean) return true;
    from = haystack.indexOf(needle, from + 1);
  }
  return false;
}

/**
 * The literals of a query that nothing has shown the agent.
 *
 * `shownText` is everything the harness put in front of it: the schema docs,
 * CHAT.md, the orientation, the skills, this conversation's grounded names and
 * every tool result on this turn. The person's own words are deliberately not
 * part of it. Case matters, because SQL equality does.
 */
export function ungrounded(sql: string, shownText: string): string[] {
  const missing = literalsIn(sql)
    .filter((literal) => !harmless(literal))
    .map((literal) => literal.value)
    .filter((value) => !shown(shownText, value));
  return [...new Set(missing)];
}

/** What a refused call is told. It names the next tool, because a refusal that teaches nothing costs a second step. */
export function refusalFor(values: string[]): string {
  const quoted = values.map((value) => `'${value}'`).join(", ");
  return (
    `${quoted} ${values.length === 1 ? "has" : "have"} not appeared in anything you have been shown on this turn, ` +
    "so filtering on it would be filtering on a guess. Call find_entity for a company or a port, " +
    "profile_column for the values of a column, or search_emails for a reference or a name in text; " +
    "then filter on an id or a value that came back. A pattern with like or ilike is allowed."
  );
}
