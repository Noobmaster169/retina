# Phase 10: Analytics schema and chat agent

## Goal

The ontology is queryable by people and by an agent. A chat page turns questions into
read-only SQL over a documented analytics schema, shows the SQL and the result, and can
explain any single decision from the audit trail. The same tools are exposed over MCP so a
teammate can use them from Claude Code.

## Prerequisites

Phase 9 merged (scheduler queue exists). Phase 4's `callStructured` and prompt registry.

## Scope

In: `analytics` schema and refresh job, read-only role, schema documentation, chat agent loop
with four tools, conversation storage, chat routes, `/chat` page, MCP server. Out: write
tools, streaming.

## Work items

### 1. Migration `009_analytics.sql`

```sql
create schema if not exists analytics;

create materialized view analytics.fact_email_outcome as
select er.run_id, er.email_id, e.sender_domain, coalesce(cl.tier, 3) as client_tier, cl.name as client_name,
       e.subject, e.tonnage_mt,
       coalesce(c.human_category, c.final_category) as category, c.decided_by,
       cmp.status, cmp.review_reason, cmp.has_defect,
       (select count(*) from core.field_diffs fd where fd.comparison_id = cmp.id) as n_defects,
       (select count(*) from core.llm_calls l where l.email_run_id = er.id) as llm_calls,
       (select coalesce(sum(cost_usd),0) from core.llm_calls l where l.email_run_id = er.id) as llm_cost_usd,
       er.stage, er.started_at, er.finished_at,
       extract(epoch from (er.finished_at - er.started_at)) * 1000 as latency_ms,
       exists (select 1 from core.review_actions ra where ra.email_run_id = er.id) as human_touched
from core.email_runs er
join core.emails e on e.email_id = er.email_id
left join core.clients cl on cl.domain = e.sender_domain
left join core.classifications c on c.email_run_id = er.id
left join core.comparisons cmp on cmp.email_run_id = er.id;
create unique index on analytics.fact_email_outcome (run_id, email_id);

create materialized view analytics.fact_field_diff as
select er.run_id, er.email_id, e.sender_domain, fd.field, fd.si_value, fd.bl_value, fd.judge_used
from core.field_diffs fd
join core.comparisons cmp on cmp.id = fd.comparison_id
join core.email_runs er on er.id = cmp.email_run_id
join core.emails e on e.email_id = er.email_id;
create unique index on analytics.fact_field_diff (run_id, email_id, field);

create view analytics.dim_client as select domain, name, tier, kind from core.clients;
create view analytics.dim_run as
select r.id, r.status, r.rate_per_second, r.total_emails, r.prompt_set, r.started_at, r.finished_at,
       (select final_score from core.submissions s where s.run_id = r.id order by created_at desc limit 1) as final_score
from core.runs r;

create materialized view analytics.agg_client_run as
select run_id, sender_domain, client_name, client_tier,
       count(*) as emails,
       count(*) filter (where category = 'BL_COMPARISON') as comparisons,
       count(*) filter (where status = 'MISMATCH') as mismatches,
       count(*) filter (where status = 'NEEDS_REVIEW') as reviews,
       (select field from analytics.fact_field_diff f where f.run_id = o.run_id and f.sender_domain = o.sender_domain
          group by field order by count(*) desc limit 1) as top_defect_field
from analytics.fact_email_outcome o
group by run_id, sender_domain, client_name, client_tier;
create unique index on analytics.agg_client_run (run_id, sender_domain);

create materialized view analytics.agg_run_stage as
select run_id,
       count(*) as emails,
       count(*) filter (where stage = 'done') as done,
       count(*) filter (where stage = 'review') as review,
       count(*) filter (where stage = 'failed') as failed,
       count(*) filter (where decided_by = 'rule') as rule_decided,
       sum(llm_cost_usd) as llm_cost_usd,
       min(started_at) as first_at, max(finished_at) as last_at
from analytics.fact_email_outcome group by run_id;
create unique index on analytics.agg_run_stage (run_id);
```

Refresh: scheduler job `refresh-analytics` every 5 minutes and triggered when a run reaches
`done + failed == total`: `refresh materialized view concurrently` in dependency order
(`fact_email_outcome`, `fact_field_diff`, `agg_client_run`, `agg_run_stage`).

### 2. Read-only role: migration `010_ro_role.sql`

```sql
do $$ begin
  if not exists (select from pg_roles where rolname = 'retina_ro') then
    create role retina_ro login password :'ro_password';
  end if;
end $$;
grant usage on schema core, analytics to retina_ro;
grant select on all tables in schema analytics to retina_ro;
grant select on core.runs, core.clients, core.emails, core.email_runs, core.attachments, core.documents,
                core.classifications, core.extractions, core.extraction_fields, core.comparisons,
                core.field_diffs, core.review_cases, core.review_actions, core.submissions, core.prompt_versions to retina_ro;
grant select (id, email_run_id, run_id, step, model, prompt_version, input_tokens, output_tokens, cost_usd, latency_ms, ok, error, created_at)
  on core.llm_calls to retina_ro;
alter default privileges in schema analytics grant select on tables to retina_ro;
alter role retina_ro set statement_timeout = '5s';
alter role retina_ro set default_transaction_read_only = on;
```

`migrate.mjs` substitutes `:'ro_password'` from `PG_RO_PASSWORD`. `config.ts` adds
`DATABASE_RO_URL`; `db.ts` exports `roPool`.

### 3. Schema documentation: `src/agents/chat/schema-docs.md`

Hand-written, one block per view and core table used by the agent: purpose, grain, columns
with one-line meaning, allowed values for enums (categories, statuses, reasons, fields),
example questions with the SQL that answers them (five examples). This file is injected into
the chat system prompt; `describe_schema` returns live `information_schema` detail when the
model asks for more.

### 4. Tools: `src/agents/chat/tools/`

Each tool: zod input schema, `run(input, ctx)`, a short description string for the prompt.

| Tool | Input | Behaviour and guardrails |
|---|---|---|
| `describe_schema` | `{ schema?: "core"\|"analytics", table?: string }` | columns and types from `information_schema` through `roPool` |
| `run_sql` | `{ sql: string, purpose: string }` | reject unless it starts with `select` or `with` (after stripping comments); reject `;` anywhere except a trailing one; reject the tokens `insert update delete drop alter create grant truncate copy pg_sleep dblink` as words; append `limit 200` when no `limit` present; run on `roPool` (5 s timeout enforced by role); truncate result to 200 rows and 20 kB of JSON; return `{ columns, rows, rowCount, truncated, durationMs }` |
| `get_email` | `{ runId?: string, emailId: string }` | trace summary (email, category, status, defect fields, review reason) via the phase 7 trace builder; latest run when `runId` omitted |
| `explain_decision` | `{ runId?: string, emailId: string }` | structured timeline: rule reasons, generator rationale, verifier verdict, per-field extraction with quotes and evidence flags, diffs with normalised values, judge results, escalation reason and detail, human actions with notes; rationales come from `llm_calls.parsed` read through the read-write pool with a fixed query (the RO role cannot see request text) |

### 5. Agent loop: `src/agents/chat/loop.ts`

Tool use is done with a JSON protocol so it works with any text model behind the proxy:

```ts
const Step = z.discriminatedUnion("action", [
  z.object({ action: z.literal("tool"), tool: z.enum(["describe_schema","run_sql","get_email","explain_decision"]), args: z.record(z.unknown()), thought: z.string().max(400) }),
  z.object({ action: z.literal("final"), answer: z.string(), sql_used: z.array(z.string()).default([]) }),
]);
```

```
runTurn(conversationId, userMessage):
  history = last 20 turns (user, assistant, tool results)
  for i in 1..8:
    step = callStructured(chat, { history, schema_docs, tools, user_message }, Step)
    if step.action == final: store assistant turn; return { answer, sql_used, toolCalls }
    result = tools[step.tool].run(parse(step.args))    # validation error -> fed back as a tool error result
    history.push(tool call + result (truncated))
  return final with "I could not finish within the tool budget" plus what was found
```

`prompts/chat/v1.md`: role (analyst over this pipeline's data), the schema docs, tool
descriptions, rules: always run SQL rather than guessing numbers, always report the SQL used,
prefer `analytics` views, say when a result was truncated, never claim writes. Model
`LLM_MODEL_CHAT` (default `subscription-sonnet`), `maxTokens` 1500, timeout 240 s. Each
loop iteration is one `llm_calls` row with `step = chat` and `run_id = null`.

### 6. Migration `011_chat.sql`

```sql
create table core.chat_conversations (id uuid primary key, title text, created_by text, created_at timestamptz default now());
create table core.chat_turns (
  id bigserial primary key,
  conversation_id uuid references core.chat_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content text not null,
  tool_name text, tool_args jsonb, tool_result jsonb,
  llm_call_ids bigint[] not null default '{}',
  created_at timestamptz default now()
);
```

### 7. Routes

| Route | Purpose |
|---|---|
| `POST /chat/conversations { title?, actor }` | new conversation |
| `GET /chat/conversations` | list |
| `GET /chat/:id` | turns |
| `POST /chat/:id/messages { content, actor }` | runs a turn; returns `{ answer, sqlUsed, toolCalls: [{ tool, args, resultPreview, durationMs }] }`; 240 s server timeout |
| `DELETE /chat/:id` | delete |

Frontend timeout: the Next.js server action for this call declares `maxDuration = 300`.

### 8. Frontend `/chat`

Left: conversation list, new conversation. Right: messages; assistant messages render
markdown, a collapsible "Tools used" block per message listing each tool call with args, and
for `run_sql` a result table (first 50 rows) and the SQL in a code block; suggested prompts
on an empty conversation ("Which client had the most mismatches in the latest run and on
which field?", "Explain email_407", "How many emails needed human review per reason this
week?"). Sending disables input until the answer arrives; a spinner shows elapsed seconds.

### 9. MCP server: `src/mcp.ts`

Stdio MCP server exposing the same four tools with the same schemas, built on the official
`@modelcontextprotocol/sdk`. Configured in `.mcp.json` at the repo root for Claude Code, run
with `DATABASE_RO_URL` and `DATABASE_URL` from `backend/.env`. Tool implementations are
imported from `agents/chat/tools`, not duplicated. Optional if the phase runs long; note in
`PROGRESS.md` if deferred.

### 10. Tests

- `tools/run_sql.test.ts`: accepts `select` and `with`; rejects `delete`, a second statement,
  `pg_sleep`, `copy`; appends `limit`; truncates rows; runs as `retina_ro` (assert
  `current_user`).
- `tools/explain_decision.test.ts`: assembled timeline for a seeded mismatch with a human
  correction.
- `loop.test.ts`: with `FakeLlmClient` scripted to call `run_sql` then `final`; tool budget
  exhaustion path; invalid args fed back once.
- `analytics.test.ts`: views refresh and `agg_client_run` counts match `core` for a seeded run.

### 11. Manual verification

- "Which client had the most mismatches in run X and on which field?" → correct table and SQL.
- "Explain email_407" → narrative covering rule, generator, evidence, diff, human action if any.
- "Delete all runs" → the agent refuses (no write tool) and says so.
- `select pg_sleep(10)` typed into a "run this SQL" request → rejected by guardrail.
- From Claude Code with `.mcp.json`: call `run_sql` and get rows.

## Exit checklist

- [ ] The two demo questions return correct answers with the SQL shown.
- [ ] `run_sql` refuses writes, multi-statement input, and long queries; runs as `retina_ro`.
- [ ] Analytics views refresh within 5 minutes of a run finishing and on run completion.
- [ ] `retina_ro` cannot read `llm_calls.request` (verified with a direct query).
- [ ] Chat turns and tool calls are stored; each loop iteration appears in `llm_calls`.
- [ ] MCP server answers a `run_sql` call from Claude Code, or its deferral is noted.

## Hand-off notes for phase 11

- `explain_decision` output is what the lesson drafter reads; keep its shape stable.
