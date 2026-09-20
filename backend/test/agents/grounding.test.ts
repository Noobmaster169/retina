import { describe, expect, it } from "vitest";

import { literalsIn, refusalFor, shown, ungrounded } from "../../src/agents/chat/grounding";

describe("literalsIn", () => {
  const cases: { name: string; sql: string; values: string[] }[] = [
    { name: "a plain literal", sql: "select 1 from t where a = 'x y'", values: ["x y"] },
    { name: "a doubled quote inside a value", sql: "select 1 from t where a = 'O''BRIEN & CO'", values: ["O'BRIEN & CO"] },
    { name: "two literals", sql: "select 1 from t where a = 'x' and b in ('y', 'z')", values: ["x", "y", "z"] },
    { name: "a dollar-quoted body", sql: "select 1 from t where a = $$it's here$$", values: ["it's here"] },
    { name: "a tagged dollar quote", sql: "select 1 from t where a = $q$x$q$", values: ["x"] },
    { name: "a quoted identifier is not a literal", sql: 'select "it\'s" from t where a = \'x\'', values: ["x"] },
    { name: "an escape string", sql: "select 1 from t where a = E'a\\'b'", values: ["a\\'b"] },
    { name: "a dollar tag with a digit in it", sql: "select 1 from t where a = $a1$x y$a1$", values: ["x y"] },
    { name: "an unterminated literal still ends", sql: "select 1 from t where a = 'oops", values: ["oops"] },
    { name: "no literal at all", sql: "select count(*) from core.emails", values: [] },
  ];
  it.each(cases)("$name", ({ sql, values }) => {
    expect(literalsIn(sql).map((literal) => literal.value)).toEqual(values);
  });

  it("records what stands before a literal, the cast after it, and the call it sits in", () => {
    const [like] = literalsIn("select 1 from t where name ilike '%paper%'");
    expect(like.before).toBe("ilike");
    const [cast] = literalsIn("select 1 from t where at > '2026-01-01'::date");
    expect(cast.cast).toBe("date");
    const [, second] = literalsIn("select 1 from t where s @@ websearch_to_tsquery('simple', 'le havre')");
    expect(second.fn).toBe("websearch_to_tsquery");
  });
});

describe("shown", () => {
  it("finds a whole value and refuses a fragment of a longer word", () => {
    expect(shown("ports: ALPHA, BETA", "ALPHA")).toBe(true);
    expect(shown("ports: ALPHA, BETA", "AL")).toBe(false);
    expect(shown("ports: ALPHA, BETA", "PHA")).toBe(false);
  });

  it("finds a value that starts or ends with punctuation", () => {
    expect(shown("name: ACME CO., LTD\tmore", "ACME CO., LTD")).toBe(true);
    expect(shown("x (KEMBA) y", "(KEMBA)")).toBe(true);
  });

  it("is case sensitive, because SQL equality is", () => {
    expect(shown("MISMATCH", "mismatch")).toBe(false);
  });
});

describe("ungrounded", () => {
  const SHOWN = [
    "status is one of `OK`, `MISMATCH`, `NEEDS_REVIEW`",
    "field is one of `consignee`, `notify_party`",
    "find_entity returned: 12\tparty\tACME FINE PAPER TRADING (MIDDLE EAST) FZE\tsimilar",
  ].join("\n");

  const cases: { name: string; sql: string; missing: string[] }[] = [
    {
      name: "a name only the question held is ungrounded",
      sql: "select * from core.entities where canonical = 'Acme Paper Trading'",
      missing: ["Acme Paper Trading"],
    },
    {
      name: "the same name as a tool returned it is grounded",
      sql: "select * from core.entities where canonical = 'ACME FINE PAPER TRADING (MIDDLE EAST) FZE'",
      missing: [],
    },
    { name: "an enum value from the schema docs", sql: "select 1 from c where status = 'MISMATCH' and field = 'consignee'", missing: [] },
    { name: "a like pattern is exploration", sql: "select 1 from core.entity_names where value ilike '%acme%'", missing: [] },
    {
      name: "a like with no wildcard is an equality, and is held to the same rule",
      sql: "select 1 from core.entities where canonical like 'Acme Paper Trading' or canonical ilike 'Jakarta'",
      missing: ["Acme Paper Trading", "Jakarta"],
    },
    { name: "a regular expression is a search", sql: "select 1 from core.emails where subject ~* 'acme'", missing: [] },
    { name: "what a case says is output, not a filter", sql: "select case when same then 'agrees' else 'differs' end from core.field_diffs", missing: [] },
    { name: "a label in the select list", sql: "select 'all runs' as scope, count(*) from core.runs", missing: [] },
    { name: "a fallback for a null", sql: "select coalesce(review_reason, 'no reason') from core.comparisons", missing: [] },
    { name: "a jsonb key", sql: "select detail->>'swapped', detail->'provisional' from core.comparisons", missing: [] },
    { name: "a time zone", sql: "select created_at at time zone 'Australia/Melbourne' from core.runs", missing: [] },
    {
      name: "a name hidden in a string function is still a name",
      sql: "select 1 from core.entities where canonical = concat_ws(' ', 'Acme', 'Trading')",
      missing: ["Acme", "Trading"],
    },
    { name: "similar to", sql: "select 1 from t where value similar to '%(acme|apex)%'", missing: [] },
    { name: "a uuid", sql: "select 1 from core.runs where id = '69ee1e42-f2cb-46b3-8fd0-fb623e4e2d71'", missing: [] },
    { name: "a number and a date", sql: "select 1 from t where a = '42' and at >= '2026-01-15'", missing: [] },
    { name: "a typed cast", sql: "select 1 from t where at > 'yesterday'::timestamptz", missing: [] },
    { name: "an interval", sql: "select 1 from t where at > now() - interval '3 months' and b < now() - '5 minutes'::interval", missing: [] },
    { name: "a date part and a format", sql: "select date_trunc('month', at), to_char(at, 'YYYY-MM') from t", missing: [] },
    { name: "a separator", sql: "select string_agg(field, ', ') from t", missing: [] },
    { name: "a text search argument", sql: "select 1 from core.emails where search @@ websearch_to_tsquery('simple', 'le havre')", missing: [] },
    {
      name: "one grounded and one not, reported once each",
      sql: "select 1 from t where a = 'MISMATCH' and b = 'Jakarta' or c = 'Jakarta'",
      missing: ["Jakarta"],
    },
    { name: "a wrong-case enum is ungrounded", sql: "select 1 from c where status = 'mismatch'", missing: ["mismatch"] },
  ];
  it.each(cases)("$name", ({ sql, missing }) => {
    expect(ungrounded(sql, SHOWN)).toEqual(missing);
  });

  it("passes the subquery find_entities hands back, shown nothing at all", () => {
    // `concept_verdicts.matched` is a stored column equal to `verdict = 'yes'`,
    // so the join the agent is told to make carries no string literal and the
    // guard has nothing to refuse. Written as `verdict = 'yes'` it would be
    // refused on every turn that had not been shown the word.
    const joinSql = "select entity_id from core.concept_verdicts where concept_id = 12 and matched";
    expect(ungrounded(joinSql, "")).toEqual([]);
    expect(ungrounded(`select count(*) from core.email_shipments where pod_id in (${joinSql})`, "")).toEqual([]);
    expect(ungrounded("select entity_id from core.concept_verdicts where verdict = 'yes'", "")).toEqual(["yes"]);
  });

  it("tells the model which tools ground a value", () => {
    const reason = refusalFor(["Jakarta"]);
    expect(reason).toContain("'Jakarta'");
    expect(reason).toContain("find_entity");
    expect(reason).toContain("profile_column");
    expect(reason).toContain("search_emails");
    // The refusal steers towards a real pattern, not towards `like` as a way round.
    expect(reason).toContain("with a % in it");
  });
});
