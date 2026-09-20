import { describe, expect, it } from "vitest";

import { DEFAULT_TIER } from "../../src/contracts";
import { getPool, getRoPool } from "../../src/db";
import { clients } from "../../src/ontology/repositories";
import { inRollback } from "../db";

/**
 * The four things phase 9's handover found wrong in the phase 10 spec, held
 * right, plus the grant the exit checklist asks about.
 *
 * The materialized views are not refreshed here: `refresh concurrently` cannot
 * run inside a transaction and these tests roll back. That the views exist at
 * all is proved on every run, because global setup applies the migration and a
 * view selecting a column that does not exist does not create.
 */

async function columnsOf(relation: string): Promise<string[]> {
  const { rows } = await getPool().query<{ column_name: string }>(
    `select a.attname as column_name
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'analytics' and c.relname = $1::text and a.attnum > 0 and not a.attisdropped`,
    [relation.replace("analytics.", "")],
  );
  return rows.map((row) => row.column_name);
}

describe("core.default_tier", () => {
  it("is the same number as DEFAULT_TIER, which is the point of it existing", async () => {
    // Correction 4. The spec wrote coalesce(cl.tier, 3) into a view while
    // contracts.clients.ts held the same 3, with nothing tying them together.
    // This is the tie: move either and this goes red.
    const { rows } = await getPool().query<{ tier: number }>("select core.default_tier() as tier");
    expect(rows[0].tier).toBe(DEFAULT_TIER);
  });
});

describe("analytics.fact_field_diff", () => {
  it("has no judge_used column, and says what it means instead", async () => {
    // Correction 2. The spec selected field_diffs.judge_used, which has never
    // existed. `judged` is the honest reading: the field judge is the only
    // thing that writes a rationale, so a rationale means it ran.
    const columns = await columnsOf("fact_field_diff");
    expect(columns).not.toContain("judge_used");
    expect(columns).toEqual(expect.arrayContaining(["same", "missing", "confidence", "judged", "differed"]));
  });
});

describe("analytics.agg_run_stage", () => {
  it("does not count rule-decided emails, because nothing is ever decided by a rule", async () => {
    // Correction 3. `rule` is a value of the organisers' submission enum and
    // of nothing else. Counting it here would report 0 forever for something
    // this product does not do on purpose.
    const columns = await columnsOf("agg_run_stage");
    expect(columns).not.toContain("rule_decided");
    expect(columns).toEqual(expect.arrayContaining(["done", "review", "failed", "verifier_decided", "human_decided"]));
  });
});

describe("analytics.dim_client", () => {
  it("agrees with the clients page, sender for sender", async () => {
    // Correction 5. The spec's view read core.clients alone and so saw only
    // ranked senders, while /clients drives off core.emails. A chat answer
    // that disagreed with the clients page would be unexplainable.
    await inRollback(async (tx) => {
      const page = await clients.list(tx);
      const { rows } = await tx.query<{ domain: string; tier: number; emails: string; mismatches: string }>(
        "select domain, tier, emails::text, mismatches::text from analytics.dim_client order by domain",
      );
      const fromView = new Map(rows.map((row) => [row.domain, row]));

      expect(fromView.size).toBe(page.length);
      for (const row of page) {
        const view = fromView.get(row.domain);
        expect(view, `${row.domain} is on the clients page and not in dim_client`).toBeDefined();
        expect(view?.tier).toBe(row.tier);
        expect(Number(view?.emails)).toBe(row.emails);
        expect(Number(view?.mismatches)).toBe(row.mismatches);
      }
    });
  });

  it("gives an unranked sender the default tier and says nobody chose it", async () => {
    await inRollback(async (tx) => {
      await tx.query(
        `insert into core.emails (email_id, from_addr, sender_domain, subject, body, raw)
         values ('email_t_unranked', 'a@nobody-ranked-this.example', 'nobody-ranked-this.example', 's', 'b', '{}'::jsonb)`,
      );
      const { rows } = await tx.query<{ tier: number; known: boolean }>(
        "select tier, known from analytics.dim_client where domain = 'nobody-ranked-this.example'",
      );
      expect(rows[0].tier).toBe(DEFAULT_TIER);
      expect(rows[0].known).toBe(false);
    });
  });
});

describe("the retina_ro role", () => {
  it("can read the analytics views", async () => {
    const roPool = getRoPool();
    expect(roPool, "DATABASE_RO_URL is unset; vitest.config.ts should set it").not.toBeNull();
    const { rows } = await (roPool as NonNullable<typeof roPool>).query<{ user: string }>(
      "select current_user as user",
    );
    expect(rows[0].user).toBe("retina_ro");
    await (roPool as NonNullable<typeof roPool>).query("select count(*) from analytics.dim_client");
  });

  it("cannot read llm_calls.request, and cannot write anything", async () => {
    const roPool = getRoPool() as NonNullable<ReturnType<typeof getRoPool>>;
    // The prompt text and the model's raw answer are the two columns a chat
    // agent must not be able to reach through a SELECT.
    await expect(roPool.query("select request from core.llm_calls limit 1")).rejects.toThrow(/permission denied/i);
    await expect(roPool.query("select response from core.llm_calls limit 1")).rejects.toThrow(/permission denied/i);
    await expect(roPool.query("select parsed from core.llm_calls limit 1")).rejects.toThrow(/permission denied/i);
    // The columns a question about cost actually needs are readable.
    await roPool.query("select step, model, cost_usd, latency_ms from core.llm_calls limit 1");
    // And the transaction is read only whatever the guardrail let through.
    await expect(roPool.query("delete from core.emails where email_id = 'nope'")).rejects.toThrow(
      /read-only transaction|permission denied/i,
    );
  });
});
