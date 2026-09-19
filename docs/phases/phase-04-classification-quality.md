# Phase 4: Classification quality

## Goal

Phase 2 classifies every email with one zero-shot LLM call. This phase makes that classification
better and makes every improvement a measured one: prompt versions that can be compared run
against run, a verifier that checks the generator when it is unsure, few-shot examples if and only
if the holdout says they help, and a comparison of models. Stage 1 on the holdout rises to 0.95 or
above. The LLM layer hardened here is reused unchanged by phases 6, 10 and 11.

There are still no hand-written classification rules, in this phase or any other. See "Why there
are no rules" in `phase-02-classify-and-score.md`. The enums stay exactly the organisers'.

## Prerequisites

**Read `phase-04-handover.md` first.** The phase 3 review changed the LLM client's error contract,
the frontend's contract mirroring and the deploy's migration constraint, and this spec has been
corrected for it in places.

Phase 3 live. Day-one checks recorded in `PROGRESS.md`: the alias list from the proxy, the image
passthrough result, behaviour under parallel calls.

## Scope

In: prompt versions and `promptSet`, the verifier, the decision, gated few-shot, model
comparison, an in-process LLM concurrency cap, client retries, a recording client for replayed
tests, the run page cost panel. Out: any document reading.

## Work items

### 1. Migration `NNN_prompt_versions.sql`

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
```

Seed rows `('classify','v1',true)` and `('classify-verify','v1',true)`. `core.llm_calls` already
exists from phase 2.

Expand/contract, like every migration here: rollback restores the previous image and never touches
Postgres, so this must stay readable by the code it would roll back to. See `CLAUDE.md` Data rules.

### 2. Prompt registry, final form

`registry.resolve(step, promptSet?)`: `promptSet[step]` if the run names one, else the `active`
row, else the highest version on disk. `POST /runs` accepts `promptSet` and stores it in
`runs.prompt_set`, so two runs over the same emails can be compared prompt against prompt. The
model from the frontmatter is overridden by `LLM_MODEL_<STEP>`. Models are proxy aliases from
`proxy/proxy.yaml` (`haiku`, `sonnet`, `opus`, `qwen3:14b`); nothing else is a valid value.

### 3. LLM client hardening

- Retries twice with jitter (1 s, 3 s) inside `complete` while `isTransient(error)` holds, then
  throws `RetryableError`. Schema errors stay `TerminalError`.
  **Loop on the verdict, never on a status list.** `UpstreamError` carries the proxy's own
  `retryable`, because an unknown provider and a dead upstream are both 500 and only one is worth
  another attempt. A status list reintroduces the phase 3 bug where a typo in `LLM_MODEL_*` was
  requeued forever without ever spending an attempt. See `phase-04-handover.md` section 1.
- `withLlmSlot(fn)`: an in-process semaphore of `LLM_MAX_CONCURRENCY` around every call. One
  worker process, one cap. Size it to what the proxy serves at once.
- `RecordingLlmClient`: wraps a real client; the key is the sha256 of `(model, system, user)`; in
  `record` mode it writes `test/fixtures/llm/<key>.json`, in `replay` mode it reads it and throws
  when missing. For the few integration tests that need realistic output.

### 4. The verifier: `prompts/classify-verify/v1.md`

It receives the same input as the generator plus the generator's proposal, is told to state the
strongest case for each other category, and then decides. Same five categories, defined the same
way, from the organisers' text only.

```ts
z.object({ category: Category, agrees: z.boolean(), confidence: z.number().min(0).max(1), rationale: z.string().max(600) })
```

### 5. Decision: `src/pipeline/classify/decide.ts` (pure)

```
needVerifier = generator.confidence < VERIFY_BELOW
final        = verifier?.category ?? generator.category
decidedBy    = verifier ? "verifier" : "llm"
```

The only input is the model's own stated confidence. `VERIFY_BELOW` is a named constant chosen on
the train split, with the holdout result recorded next to it. There is no branch on the email's
sender, subject or body.

### 6. Few-shot, gated: `src/eval/examples.ts` (`pnpm eval:examples`)

Picks a seeded few per category from `split.json.train`, asserts no holdout id appears, writes
`prompts/classify/examples.json` for a new prompt version (`v2`), and leaves `v1` untouched.
Examples ship only if a holdout run of `v2` beats `v1`; both numbers go in `PROGRESS.md`. If it
does not, `v2` is deleted and the result is still recorded, so nobody repeats the experiment
blind. Examples are data the model reads, never a lookup: the pipeline does not match an incoming
email against them.

### 7. Model comparison

`sonnet` is the model for every step (decided 2026-09-19) and stays the default. This item only
measures the alternatives: one holdout run per alias under the same prompt version, with stage 1
macro-F1, the confusion matrix, cost per email and latency per email recorded in `PROGRESS.md`.
Changing the default on the strength of those numbers is the user's call, not the phase's.

### 8. Classify processor, final form

```
input   = buildClassifyInput(email, attachment names)
gen     = callStructured(classify, input)
ver     = needVerifier(gen) ? callStructured(classify-verify, { ...input, proposal: gen }) : null
final   = ver?.category ?? gen.category
classifications.upsert({ gen_*, ver_*, final_category: final,
                         decided_by: ver ? "verifier" : "llm",
                         rationale: { generator, verifier }, model, prompt_version })
```

The rest is unchanged: `BL_COMPARISON` goes to the compare queue, anything else is `done`.

### 9. Run page additions

`GET /runs/:id` gains `llm: { calls, inputTokens, outputTokens, costUsd, verifierShare }` from one
aggregate over `llm_calls` and `classifications`. The email list gains `category` and `decidedBy`
columns and a category filter.

The frontend mirror is a zod schema in `frontend/lib/api/runs-client.ts`, not an interface: every
response is parsed there now. `getRun` and `listRunEmails` were deleted as unused in the phase 3
review and come back with this page; restore them from `git show d68ed1b^:frontend/lib/api-client.ts`
as schemas. See `phase-04-handover.md` sections 3 and 4.

### 10. Tests

- `agents/prompts/registry.test.ts`: `promptSet` override, active row, env model override.
- `pipeline/classify/decide.test.ts`: the verifier trigger table and the `decided_by` mapping.
- `queues/processors.test.ts` with `FakeLlmClient`: a confident generator (no verifier call), an
  unsure one (the verifier is called and its category wins), a proxy 503 (`RetryableError`
  propagates, `llm_calls.ok = false`), and an unknown provider (a 500 the proxy marks
  `retryable: false`, which must fail the email rather than requeue it).
- `agents/llm-client.test.ts`: extend the existing table (it already pins six status/verdict
  combinations, including an unknown provider's permanent 500) with retry-then-success and the
  jitter timing. Do not replace it.
- `eval/examples.test.ts`: no holdout id among the examples.

### 11. Manual verification

```bash
pnpm eval:score --run <id> --holdout            # stage 1 macro-F1 and the confusion matrix
psql ... -c "select decided_by, count(*) from core.classifications c join core.email_runs er on er.id = c.email_run_id where er.run_id = '<id>' group by 1"
psql ... -c "select step, model, count(*), sum(cost_usd), avg(latency_ms) from core.llm_calls where run_id = '<id>' group by 1, 2"
```

## Exit checklist

- [ ] Stage 1 macro-F1 on the holdout at or above 0.95; the full-set confusion matrix in `PROGRESS.md`.
- [ ] The verifier ran on under 25% of emails.
- [ ] The few-shot experiment is recorded with both holdout numbers, whichever way it went.
- [ ] The model comparison is recorded; the default stays `sonnet` unless the user changes it.
- [ ] Still no rule decides a category, and every enum is still exactly the organisers'.
- [ ] Processor tests pass with `FakeLlmClient` and no network.
- [ ] A run at `LLM_MAX_CONCURRENCY` completes with no proxy 429 in `llm_calls.error`.
- [ ] The image passthrough result is written in `PROGRESS.md` under "Verified on the box".

## Hand-off notes for phase 5

- The `DocExtractClient` interface should mirror the `LlmClient` pattern: interface, real client,
  fake, `RetryableError` on 5xx and timeouts.
