# Phase 4: LLM classification

## Goal

Rules propose, an LLM generator decides with reasoning and few-shot examples, a verifier
checks when there is doubt. Every call is on a ledger with prompt version, tokens, cost and
latency. Stage 1 score rises above rules alone, and the LLM layer built here (client,
structured output, prompt registry, fakes) is reused unchanged by phases 6, 10 and 11.

## Prerequisites

Phase 3 live. Day-one checks recorded in `PROGRESS.md`: alias list from the proxy, image
passthrough result, behaviour under 8 parallel calls.

## Scope

In: LLM client abstraction, structured output, prompt registry and versions, few-shot
generation, generator, verifier, decision, ledger, per-process concurrency cap, run page cost
panel. Out: any document reading.

## Work items

### 1. Migration `003_llm.sql`

```sql
create table core.prompt_versions (
  step        text not null,
  version     text not null,
  active      boolean not null default false,
  model       text,
  notes       text,
  created_at  timestamptz not null default now(),
  primary key (step, version)
);
create unique index prompt_versions_one_active on core.prompt_versions (step) where active;

create table core.llm_calls (
  id             bigserial primary key,
  email_run_id   bigint references core.email_runs(id) on delete cascade,
  run_id         uuid references core.runs(id) on delete cascade,
  step           text not null,
  model          text not null,
  prompt_version text not null,
  request        jsonb not null,
  response       jsonb,
  parsed         jsonb,
  input_tokens   int,
  output_tokens  int,
  cost_usd       numeric,
  latency_ms     int not null,
  ok             boolean not null,
  error          text,
  attempt        int not null default 1,
  created_at     timestamptz not null default now()
);
create index on core.llm_calls (email_run_id);
create index on core.llm_calls (run_id, step);
```

Seed rows: `('classify','v1',true)`, `('classify-verify','v1',true)` inserted by the migration.

### 2. LLM client: `src/llm.ts` (extend the template's client)

```ts
export interface LlmMessage { role: "system" | "user" | "assistant"; content: string | LlmContentPart[] }
export interface LlmContentPart { type: "text"; text: string } | { type: "image"; mediaType: string; dataBase64: string }
export interface LlmRequest { model: string; messages: LlmMessage[]; maxTokens: number; temperature?: number; project: string; timeoutMs: number }
export interface LlmResponse { text: string; model: string; stopReason: string; usage: { inputTokens: number; outputTokens: number }; costUsd: number | null }
export interface LlmClient { complete(req: LlmRequest): Promise<LlmResponse> }
```

`ProxyLlmClient`: keeps whatever wire format the template already uses against the proxy;
maps `image` parts to the proxy's image content format (result of the day-one check decides
whether images are sent or stripped with a warning log). Retries 429, 502, 503, 504 and
timeouts twice with jitter (1 s, 3 s) inside `complete`; then throws `RetryableError`. 400
and schema errors throw `TerminalError`. `project` is sent the same way the template tags
`retina-frontend` / `retina-team` so `/admin/usage` splits spend; values used:
`retina-worker`, `retina-chat`.

Concurrency: `withLlmSlot(fn)` wraps every call with an in-process semaphore of size
`LLM_MAX_CONCURRENCY` (default 8 in the worker, 2 in the api). One process, one cap; the
Redis semaphore from the deep dive is dropped in favour of this.

Fakes in `src/llm/__fakes__/`:

- `FakeLlmClient`: constructed with a `(req) => string | LlmResponse` function or a queue of
  responses; records every request.
- `RecordingLlmClient`: wraps a real client; key = sha256 of `(model, messages)`; in `record`
  mode writes `test/fixtures/llm/<key>.json`; in `replay` mode reads it and throws if missing.
  Used for a handful of integration tests that need realistic outputs.

### 3. Structured output: `src/agents/structured.ts`

```ts
callStructured<T>(deps, { step, input, schema: z.ZodType<T>, emailRunId?, runId? }): Promise<{ value: T; call: LlmCallRecord }>
```

1. Resolve prompt: `registry.resolve(step, runPromptSet)` → `{ version, system, model, maxTokens, temperature }`.
2. Build messages: system = prompt text with `{{examples}}` and `{{schema}}` filled;
   user = `renderInput(input)` (labelled sections, JSON for structured parts).
3. `complete` through `withLlmSlot`.
4. Extract JSON: first fenced ```json block, else first `{ ... }` balanced object.
5. `schema.safeParse`; on failure append an assistant turn with the raw output and a user
   turn "Your output failed validation: <issues>. Return only the corrected JSON." and call
   once more.
6. Insert `llm_calls` for every attempt (ok false with error on failure). Second failure →
   `TerminalError("structured output invalid for step X")`.

### 4. Prompt registry: `src/agents/prompts/`

Layout: `prompts/<step>/<version>.md` with YAML frontmatter:

```markdown
---
step: classify
version: v1
model: subscription-sonnet
max_tokens: 500
temperature: 0
---
You are the triage step of a shipping documentation pipeline...
```

`registry.ts`: loads all files at boot, validates frontmatter with zod, exposes
`resolve(step, promptSet?)`: `promptSet[step]` if given, else the `active` row from
`prompt_versions`, else the highest version on disk. Model from frontmatter can be overridden
by `LLM_MODEL_<STEP>` env (`LLM_MODEL_CLASSIFY`, `LLM_MODEL_CLASSIFY_VERIFY`, later
`LLM_MODEL_EXTRACT`, `LLM_MODEL_PARTY_JUDGE`, `LLM_MODEL_CHAT`).

Examples: `prompts/<step>/examples.json` generated by `pnpm eval:examples` (work item 6) and
inserted at `{{examples}}` as numbered blocks.

### 5. Prompt content

`classify/v1.md` (system):

- Role and the five categories with one-line definitions grounded in this inbox:
  `BL_COMPARISON` = a request to check, confirm, compare or send a draft BL against an SI
  (with or without attachments); `SI_REQUEST` = a request to prepare or provide shipping
  instructions, often containing SI details in the body and asking for a draft BL later;
  `INVOICE_QUERY` = billing, GR, cancellation, local charges, D&D, freight totals;
  `GENERAL` = operational broadcasts, reports, reminders, bot notices, HR;
  `SPAM` = unsolicited marketing or phishing.
- Disambiguation notes: an email whose body lists POL, POD, shipper and gross weight and asks
  to "revert with draft BL" is `SI_REQUEST`, not `BL_COMPARISON`; "please send the draft BL
  for checking" is `BL_COMPARISON` even with no attachments; forwarded thread tails and
  signature blocks are not evidence; the rule hint is evidence, not the answer.
- Instruction to reason briefly first, then output only JSON matching `{{schema}}`.
- `{{examples}}`: 3 per category from the train split.

User message: `sender_domain`, `subject` (normalised), `attachments` (names), `rule_hint`
(`{category, confidence, reasons}` or `none`), `body` (cleaned, first 1500 chars).

Output schema `ClassifyOutput`:

```ts
z.object({ category: Category, confidence: z.number().min(0).max(1), rationale: z.string().max(600) })
```

`classify-verify/v1.md`: receives the same evidence plus `proposals: { rule, generator }`.
Instructed to state the strongest case for each alternative category, then decide. Output:

```ts
z.object({ category: Category, agrees_with: z.enum(["rule","generator","neither"]), confidence: z.number(), rationale: z.string().max(600) })
```

### 6. Few-shot generation: `src/eval/examples.ts` (`pnpm eval:examples`)

For `classify`: from `split.json.train` and ground truth, pick 3 per category with a seeded
shuffle, preferring variety (one with a reply prefix, one with a quoted thread, one plain).
Each example: `{ sender_domain, subject, attachments, body_excerpt (600 chars, cleaned), category }`.
Write `prompts/classify/examples.json`. Commit it. Holdout ids never appear (assert).

### 7. Classify processor (final form)

```
input   = buildClassifyInput(email, attachments)          // phase 2
rule    = classifyByRules(input)
gen     = callStructured(classify, { ...input, rule_hint: rule })
needVer = (rule.category && rule.category !== gen.category)
          || gen.confidence < 0.75
          || (rule.confidence < 0.6 && gen.confidence < 0.85)
ver     = needVer ? callStructured(classify-verify, { ...input, proposals: { rule, generator: gen } }) : null
final   = ver?.category ?? gen.category
decidedBy = ver ? "verifier"
          : (rule.category === final && rule.confidence >= 0.95) ? "rule"
          : "llm"
classifications.upsert({ rule_*, gen_*, ver_*, final_category: final, decided_by, prompt_version, rationale: { rule: rule.reasons, generator: gen.rationale, verifier: ver?.rationale } })
```

Rest unchanged: `BL_COMPARISON` → compare queue, else `done`.

Thresholds live in `pipeline/classify/decide.ts` as named constants with a comment that
they were tuned on the train split only.

### 8. Run page additions

`GET /runs/:id` gains `llm: { calls, inputTokens, outputTokens, costUsd, verifierShare, ruleShare }`
from one aggregate over `llm_calls` and `classifications`. Email list gains `category` and
`decidedBy` columns and a category filter.

### 9. Tests

- `agents/structured.test.ts`: fenced and unfenced JSON extraction, retry on invalid output,
  `TerminalError` after second failure, `llm_calls` rows for each attempt (repository fake).
- `agents/prompts/registry.test.ts`: frontmatter validation, `promptSet` override, env model
  override, missing step error.
- `pipeline/classify/decide.test.ts`: verifier trigger table (agree high confidence → no
  verifier; disagree → verifier; low confidence → verifier), `decided_by` mapping.
- `queues/processors/classify.processor.test.ts`: with `FakeLlmClient`, end to end for a
  rule-confident email (no verifier call), a disagreement (verifier called, its category
  wins), and a proxy 503 (RetryableError propagates, `llm_calls.ok = false`).
- `llm/proxy-client.test.ts`: retry on 503 then success, `TerminalError` on 400 (mock fetch).
- `eval/examples.test.ts`: no holdout id in examples, 3 per category.

### 10. Manual verification

```bash
pnpm eval:examples && git add backend/src/agents/prompts/classify/examples.json
# full run, then
pnpm eval:score --run <id> --holdout            # stage1 macro-F1 and confusion
psql ... -c "select decided_by, count(*) from core.classifications c join core.email_runs er on er.id=c.email_run_id where er.run_id='<id>' group by 1"
psql ... -c "select step, count(*), sum(cost_usd), avg(latency_ms) from core.llm_calls where run_id='<id>' group by 1"
curl -s 172.17.0.1:4000/admin/usage | jq .            # on the box: retina-worker present
```

## Exit checklist

- [ ] Stage 1 macro-F1 on holdout at or above 0.95; full-set confusion matrix in `PROGRESS.md`.
- [ ] Verifier ran on under 25% of emails; `decided_by = rule` share recorded.
- [ ] `llm_calls` has one row per attempt with tokens, cost, latency, prompt_version; proxy usage shows `retina-worker`.
- [ ] Processor tests pass with `FakeLlmClient` and no network.
- [ ] `LLM_MAX_CONCURRENCY=8` run completes with no proxy 429 in `llm_calls.error`.
- [ ] Image passthrough result written in `PROGRESS.md` under "Verified on the box".

## Hand-off notes for phase 5

- The `DocExtractClient` interface should mirror the `LlmClient` pattern: interface, real
  client, fake, `RetryableError` on 5xx and timeouts.
