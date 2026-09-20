# Phase 10: Analytics schema, the ontology surfaces, and the chat agent

**Corrected against what was built.** CLAUDE.md rule 5: the repo wins for anything already built.
Six things in the first draft of this file were wrong and are fixed below, each marked
**corrected**; `docs/phases/phase-10-handover.md` section 1 found five of them against the live
schema before any code was written, and the sixth turned up in a browser.

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

### 1. Migration `010_analytics.sql`

**Corrected: the number.** Phase 9 took `009` for `009_clients_seed.sql`, and `db/migrate.mjs`
applies by filename, so a duplicate number is a migration that silently never runs. The phase's
migrations are `010` analytics, `011` the role, `012` chat, `013` the entity tables and `014` the
grant `013` needed. Check `ls backend/db/migrations/` before naming a file.

```sql
create schema if not exists analytics;

create materialized view analytics.fact_email_outcome as
select er.run_id, er.email_id, e.sender_domain, coalesce(cl.tier, 3) as client_tier, cl.name as client_name,
       e.subject, e.tonnage_mt,
       coalesce(c.human_category, c.final_category) as category, c.decided_by,
       cmp.status, cmp.review_reason, cmp.has_defect,
       -- corrected: a defect is a judgement that differed, not all seven
       (select count(*) from core.field_diffs fd
         where fd.comparison_id = cmp.id and not fd.same and not fd.missing) as n_defects,
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
-- corrected: field_diffs has no judge_used column and never has. The real
-- columns are same, missing, confidence and rationale; `judged` is
-- `rationale is not null`, because the field judge is the only writer of one,
-- and `differed` is `not same and not missing`, which is what a defect means.
select er.run_id, er.email_id, e.sender_domain, fd.field, fd.si_value, fd.bl_value,
       fd.same, fd.missing, fd.confidence,
       fd.rationale is not null as judged,
       not fd.same and not fd.missing as differed
from core.field_diffs fd
join core.comparisons cmp on cmp.id = fd.comparison_id
join core.email_runs er on er.id = cmp.email_run_id
join core.emails e on e.email_id = er.email_id;
create unique index on analytics.fact_field_diff (run_id, email_id, field);

-- corrected: this saw only senders somebody had ranked, while /clients drives
-- off core.emails so an unranked sender is still on it. A chat answer that
-- disagreed with the clients page would be unexplainable. It is
-- clients.repo.ts:list as a view, `known` included.
create view analytics.dim_client as ...;   -- see 010_analytics.sql
create view analytics.dim_run as
select r.id, r.status, r.rate_per_second, r.total_emails, r.prompt_set, r.started_at, r.finished_at,
       (select final_score from core.submissions s where s.run_id = r.id order by created_at desc limit 1) as final_score
from core.runs r;

create materialized view analytics.agg_client_run as
select run_id, sender_domain, client_name, client_tier,  -- client_tier via core.default_tier()
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
       -- corrected: nothing is ever decided_by 'rule'. classifications is
       -- llm|verifier|human and comparisons is llm|human; `rule` belongs to the
       -- organisers' submission enum and nowhere else, because no hand-written
       -- rule decides a category here, on purpose. Dropped, not made true.
       count(*) filter (where category_decided_by = 'verifier') as verifier_decided,
       sum(llm_cost_usd) as llm_cost_usd,
       min(started_at) as first_at, max(finished_at) as last_at
from analytics.fact_email_outcome group by run_id;
create unique index on analytics.agg_run_stage (run_id);
```

**Corrected: `coalesce(cl.tier, 3)`.** The same number lived in `contracts.clients.ts` as
`DEFAULT_TIER` with nothing tying them together. `core.default_tier()` is the tie and
`analytics.test.ts` holds the two equal.

Refresh: scheduler job `refresh-analytics` every 5 minutes, `refresh materialized view
concurrently` in dependency order, and only when `core` has moved.

**Corrected: there is no refresh on run completion.** There is no run-completion event in this
codebase to hang one on, and inventing a seam so a 520 row view refreshes a few minutes sooner is
not worth it. The clock is the trigger; `pnpm derive` forces it for a deploy or a demo.
`ontology/derived.ts` owns both derived things, each on its own staleness check, because a
materialised view is created already populated and gating the entity resolver on the views'
watermark meant it never ran on a fresh database.

### 2. Read-only role: migration `011_ro_role.sql`

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

Tool use is done with a JSON protocol so it works with any text model behind the proxy.

**Corrected: the step schema cannot be a union.** The provider refuses `oneOf`, `anyOf` and
`allOf` at the top level of a tool schema, and the refusal arrives as a 502 from the proxy marked
retryable, so the caller retries a call that can never succeed with the reason three layers from
the schema that caused it. `toOutputSchema` throws a `TerminalError` naming the fix now, and the
fix is one flat object narrowed after it parses:

```ts
const Step = z.object({
  action: z.enum(["tool", "final"]),
  tool: z.enum(TOOL_NAMES).nullable().default(null),
  args: z.record(z.string(), z.unknown()).default({}),
  thought: z.string().max(400).default(""),
  answer: z.string().default(""),
  sql_used: z.array(z.string()).default([]),
});
```

A tool step that names no tool is the one shape this lets through that the union would not; the
loop hands that back the way it hands back a bad query.

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
`LLM_MODEL_CHAT` (default `sonnet`, a proxy alias), `maxTokens` 1500, timeout 240 s. Each
loop iteration is one `llm_calls` row with `step = chat` and `run_id = null`.

### 6. Migration `012_chat.sql`

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

Built, and what each one holds:

- `agents/sql-guard.test.ts`, 23 cases: `select` and `with` accepted, a limit added and an existing
  one kept, writes refused, a write hidden in a data-modifying CTE refused, a second statement
  refused including behind a comment, `pg_sleep` and `dblink` and the file readers refused, and the
  case a careless word boundary breaks: `updated_at`, `offset` and `documents` are not `update`,
  `set` and `do`.
- `agents/chat-loop.test.ts`, 6: a refusal fed back and corrected, bad arguments fed back once, the
  step budget exhausted answering with what it found, the graph drawn with its dead end, and one
  `llm_calls` row per step with `run_id` null. Each in a rolled-back transaction.
- `agents/output-schema.test.ts`: a top-level union refused at the seam, a plain object untouched.
- `pipeline/ontology-resolve.test.ts`, 11: the resolver over the dataset's real Nantong cluster,
  including the OCR slip and two spellings no judge compared staying two things.
- `repositories/analytics.test.ts`, 8: the four spec corrections, and the role refused
  `llm_calls.request`, `response` and `parsed` and a delete.
- `routes/chat.routes.test.ts`, 6, and `routes/ontology.routes.test.ts`, 13.
- `frontend/lib/graph/layout.test.ts`, 8: the layered layout, deterministic, cycles terminating.

**Corrected: no test refreshes a materialised view.** `refresh concurrently` cannot run inside a
transaction, and these tests roll back. That the views create at all is proved on every run,
because global setup applies the migration and a view selecting a column that does not exist does
not create.

### 11. Manual verification

- "Which client had the most mismatches in run X and on which field?" → correct table and SQL.
- "Explain email_407" → narrative covering rule, generator, evidence, diff, human action if any.
- "Delete all runs" → the agent refuses (no write tool) and says so.
- `select pg_sleep(10)` typed into a "run this SQL" request → rejected by guardrail.
- From Claude Code with `.mcp.json`: call `run_sql` and get rows.

### 12. The ontology surfaces (10b)

Not in the first draft of this file, which covered 10a only. `docs/04-phases.md` lists them under
10b and the canvas draws them; they are built.

- `GET /ontology/types|:type|:type/:id|:id/detail|:id/graph`, and `GET /database/tables...`.
- Migration `013`: `core.entities`, `entity_names`, `entity_mentions`, resolved by
  `pipeline/ontology/resolve.ts` from `extraction_fields` and the field judge's same-verdicts, and
  nothing else. Port and party only: nothing in the seven fields yields a shipment or a carrier, so
  those stay `planned` and are drawn dashed.
- The ontology page: **Things, Record and Links**, over one of five types. `DbEntities`'s list
  and `DbRecord`'s record are the Things and Record tabs of a resolved thing; `ObjectTyped` and
  `GraphLinks` are an email's. The database page (`DbGrid`) is built and **hidden from the rail**:
  browsing raw tables is a flow nobody needs beside the ontology, and it is kept reachable by URL
  only because it is the page that proves the ontology is not a mock-up.
- Five navigable types and not twelve. Runs, Attachments, Documents, Comparisons, Differences and
  Fields are real and are reached through an object rather than browsed, because nobody opens a
  list of 3,178 Fields. Client folds into Party, since a sender domain and a consignee are the
  same company read two ways; `/clients` is still where a tier is set.
- The Record tab has no column configurator. The canvas drew one, and it configured a list of
  eleven values with an Add menu offering three kinds of column that do not exist and two dead
  tabs. One column, and the `written by` beside every value, is the part that was arguing.
- The Links canvas is React Flow with the layout kept pure in `lib/graph/layout.ts`, because React
  Flow does no layout of its own. The chat's result graph is inline SVG over the same function: it
  does not pan or zoom, so a canvas runtime would be weight for nothing.

## Exit checklist

- [x] The demo questions return correct answers with the SQL shown. Verified on run `bd2f686e`:
      "Which of the seven fields differs most often?" answered `container_count` with 10, ahead of
      `port_of_discharge` at 8 and `gross_weight_kg` at 5, from one query over
      `analytics.fact_field_diff` scoped to the conversation's run without being told to.
- [x] `run_sql` refuses writes, multi-statement input and the rest: 23 cases in
      `sql-guard.test.ts`, and a `delete` refused live through MCP.
- [x] The views and the resolved ontology refresh on the five-minute tick when `core` has moved,
      each on its own staleness check. **Not** on run completion: there is no such event, and the
      spec above says why that was dropped rather than faked.
- [x] `retina_ro` cannot read `llm_calls.request`, `response` or `parsed`, and cannot delete.
      `analytics.test.ts`.
- [x] Chat turns and tool calls are stored; each loop iteration is one `llm_calls` row with
      `run_id = null`, held by a test.
- [x] The MCP server answers `run_sql` over stdio: verified with a raw JSON-RPC exchange, all four
      tools listed, a write refused, and the spellings query returning rows.
- [x] The planned types are exactly the ones with no table, held by `ontology.routes.test.ts`.
- [x] `written these ways` reads from judge verdicts alone. On the dataset: `NANTONG, CHINA
      (CNNTG)` on 63 documents kept, `NANTONG, CHINA` on 3 joined at 0.98.
- [ ] The full 520-email run against these pages. The one run of 520 in the database has no
      MISMATCH in it, so the ontology and database pages were checked against `bd2f686e` (52
      emails, 23 mismatches). Left for the user; it costs real tokens.
- [ ] **The chat itself.** It works and it is thin. Only `run_sql` has been exercised by a live
      model; the other three tools have been called by tests and by hand over MCP, never by a
      model choosing to. The full list of what is unfinished is
      `docs/phases/phase-11-handover.md` section 3, and it is what makes this phase semi done
      rather than done.

## Hand-off notes for phase 11

**`docs/phases/phase-11-handover.md` is the document.** It carries what is built, the chat's
backlog, the traps and what was deliberately cut. The short version:

- `explain_decision` output is what the lesson drafter reads; keep its shape stable.
- The action card's contract is `docs/03-infra-deep.md` section 5.6, settled. Two things it leaves
  for phase 11: which case a correction on an un-escalated email is addressed to, and the column
  that separates `Apply and remember` from `Just this once`.
- A grant does not reach a table a later migration adds. If phase 11 adds a table the agent reads,
  grant it in the same commit; `014_ro_entities.sql` says why.
- A structured step with two shapes is one flat object, never a union: the provider refuses
  `oneOf` at the top level of a tool schema and reports it as a retryable 502.
