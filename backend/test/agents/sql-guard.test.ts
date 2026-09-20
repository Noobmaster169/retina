import { describe, expect, it } from "vitest";

import { guardSql, MAX_ROWS, stripComments } from "../../src/agents/chat/sql-guard";

function refusal(sql: string): string {
  const verdict = guardSql(sql);
  if (verdict.ok) throw new Error(`expected a refusal, got: ${verdict.sql}`);
  return verdict.reason;
}

function accepted(sql: string): string {
  const verdict = guardSql(sql);
  if (!verdict.ok) throw new Error(`expected an acceptance, got: ${verdict.reason}`);
  return verdict.sql;
}

describe("guardSql", () => {
  it("accepts a select and gives it a limit", () => {
    expect(accepted("select * from analytics.dim_client")).toBe(`select * from analytics.dim_client limit ${MAX_ROWS}`);
  });

  it("accepts a with, which is how a real question gets answered", () => {
    const sql = "with m as (select run_id from analytics.agg_run_stage) select * from m";
    expect(accepted(sql)).toBe(`${sql} limit ${MAX_ROWS}`);
  });

  it("leaves a limit the query already asked for", () => {
    expect(accepted("select 1 limit 5")).toBe("select 1 limit 5");
    expect(accepted("select 1 limit 5 offset 10")).toBe("select 1 limit 5 offset 10");
  });

  it("adds a limit when the only one is inside a subquery", () => {
    const sql = "select * from (select 1 limit 3) t";
    expect(accepted(sql)).toBe(`${sql} limit ${MAX_ROWS}`);
  });

  it("tolerates one trailing semicolon and does not put the limit after it", () => {
    expect(accepted("select 1;")).toBe(`select 1 limit ${MAX_ROWS}`);
  });

  it.each([
    ["delete", "delete from core.emails"],
    ["insert", "insert into core.emails values (1)"],
    ["update", "update core.clients set tier = 1"],
    ["drop", "drop table core.emails"],
    ["truncate", "truncate core.emails"],
    ["grant", "grant select on core.emails to public"],
    ["alter", "alter table core.emails add column x int"],
    ["copy", "copy core.emails to '/tmp/out'"],
  ])("refuses a %s outright", (_word, sql) => {
    expect(refusal(sql)).toMatch(/start with `select` or `with`|may only read/);
  });

  it("refuses a write hidden in a data-modifying CTE", () => {
    const sql = "with gone as (delete from core.emails returning email_id) select * from gone";
    expect(refusal(sql)).toContain("`delete` is not allowed");
  });

  it("refuses a second statement", () => {
    expect(refusal("select 1; drop table core.emails")).toContain("only one statement");
  });

  it("refuses a second statement hidden behind a comment", () => {
    expect(refusal("select 1 -- \n; drop table core.emails")).toContain("only one statement");
  });

  it("refuses pg_sleep, which is how a select holds a connection", () => {
    expect(refusal("select pg_sleep(10)")).toContain("`pg_sleep` is not allowed");
  });

  it("refuses dblink and the file-reading functions", () => {
    expect(refusal("select dblink('', '')")).toContain("`dblink`");
    expect(refusal("select pg_read_file('/etc/passwd')")).toContain("`pg_read_file`");
  });

  it("refuses an empty query and one that is only a comment", () => {
    expect(refusal("   ")).toContain("empty");
    expect(refusal("-- nothing here")).toContain("empty");
    expect(refusal(";")).toContain("empty");
  });

  it("refuses anything that does not start by reading", () => {
    expect(refusal("vacuum full")).toContain("start with `select` or `with`");
  });

  it("does not trip on column names that merely contain a banned word", () => {
    // `updated_at` holds `update`, `offset` holds `set`, `documents` holds `do`,
    // and none of them is that word. This is the case a careless \b would break.
    const sql = "select updated_at from core.documents order by updated_at limit 10 offset 2";
    expect(accepted(sql)).toBe(sql);
  });

  it("refuses a banned word inside a string literal, on purpose", () => {
    // Telling this apart from a real one needs a parser. Refusing costs a
    // rephrase; allowing it costs the guarantee.
    expect(refusal("select 'delete' as word")).toContain("`delete` is not allowed");
  });
});

describe("stripComments", () => {
  it("removes line and block comments", () => {
    expect(stripComments("select 1 -- a comment\n/* and\nanother */ from t").replace(/\s+/g, " ").trim()).toBe(
      "select 1 from t",
    );
  });
});
