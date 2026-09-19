# Phase 2: LLM classification, submission, first score

## Goal

A real number from the organisers' scorer, with every email classified by the LLM, plus a local
eval harness that reproduces that number on a holdout split. From here on every change is
measured.

## Why there are no rules

The 520 emails are one seeded draw from a generator. A sender list, a subject keyword table or a
body pattern written against them is an assumption about a small sample, and the judges may score
a different draw. So classification is the model's job, the prompt describes the task in the
organisers' words, and the eval harness, not intuition, says whether it works.

Not allowed in `pipeline/classify/`, in the classify processor, or in a prompt:

- lists of senders or sender domains, including a spam list;
- subject or body keyword tables, and regexes over email content;
- subject templates or phrases copied from the dataset;
- stripping signatures, quoted threads or warning banners by pattern.

Allowed: a length cap on the body (a cost guard, not a judgement), and passing structural facts
through unchanged (the sender address, the attachment file names, the attachment count).

**Prompts describe the task, not the dataset.** Every statement in a prompt must trace to the
organisers' written definitions (the brief PDF, `emails/data_v2/README.md`), never to a frequency
observed in the inbox. Few-shot examples are not part of this phase; phase 4 adds them only if the
holdout shows they help.

## Enums

Exactly the organisers', from `emails/data_v2/README.md` and `emails/server/scoring.py`. One zod
definition each in `contracts.ts`; database check constraints repeat them; the frontend mirrors
them. No other value is ever stored in these columns or sent to the scorer.

| Enum | Values |
|---|---|
| `category` | `BL_COMPARISON`, `SI_REQUEST`, `INVOICE_QUERY`, `GENERAL`, `SPAM` |
| `status` | `OK`, `MISMATCH`, `NEEDS_REVIEW` |
| `review_reason` | `null`, `wrong_doc_type`, `missing_attachment`, `unreadable`, `missing_value` |
| `defect_fields` items | `shipper`, `consignee`, `notify_party`, `port_of_loading`, `port_of_discharge`, `container_count`, `gross_weight_kg` |

The README's table is enforced, not just followed:

| status | has_defect | defect_fields | review_reason |
|---|---|---|---|
| `OK` | false | `[]` | null |
| `MISMATCH` | true | the fields, at least one | null |
| `NEEDS_REVIEW` | false | `[]` | one of the four |

`decided_by` in the submission is the scorer's unscored cost diagnostic (`rule` or `llm`). This
pipeline always sends `llm`. Inside the database `classifications.decided_by` is `llm`, `verifier`
or `human`; that column is ours, not an organiser enum.

## Prerequisites

Phase 1 complete and merged. The proxy running locally (`./start.sh` in `proxy/`) for a real run;
tests never touch it.

## Scope

In: the LLM seam and its fake, structured output, one zero-shot classify prompt, the `llm_calls`
ledger, `classifications` and `comparisons` persistence, submission builder, submit route, eval
split, TS port of the scorer, eval CLI, score card in the UI. Out: verifier, prompt versioning,
few-shot, any attachment parsing.

## Work items

### 1. Migration `003_classifications_comparisons.sql`

`002` is `run_ingest_epoch`, from the phase 1 review.

```sql
create table core.classifications (
  id              bigserial primary key,
  email_run_id    bigint not null unique references core.email_runs(id) on delete cascade,
  gen_category    text check (gen_category in ('BL_COMPARISON','SI_REQUEST','INVOICE_QUERY','GENERAL','SPAM')),
  gen_confidence  numeric,
  ver_category    text check (ver_category in ('BL_COMPARISON','SI_REQUEST','INVOICE_QUERY','GENERAL','SPAM')),
  ver_confidence  numeric,
  final_category  text not null check (final_category in ('BL_COMPARISON','SI_REQUEST','INVOICE_QUERY','GENERAL','SPAM')),
  human_category  text check (human_category in ('BL_COMPARISON','SI_REQUEST','INVOICE_QUERY','GENERAL','SPAM')),
  decided_by      text not null check (decided_by in ('llm','verifier','human')),
  rationale       jsonb not null default '{}'::jsonb,
  model           text,
  prompt_version  text,
  created_at      timestamptz not null default now()
);

create table core.comparisons (
  id             bigserial primary key,
  email_run_id   bigint not null unique references core.email_runs(id) on delete cascade,
  status         text not null check (status in ('OK','MISMATCH','NEEDS_REVIEW')),
  review_reason  text check (review_reason in ('wrong_doc_type','missing_attachment','unreadable','missing_value')),
  has_defect     boolean not null default false,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  check ((status = 'NEEDS_REVIEW') = (review_reason is not null)),
  check ((status = 'MISMATCH') = has_defect)
);

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

create table core.submissions (
  id           bigserial primary key,
  run_id       uuid not null references core.runs(id) on delete cascade,
  payload_key  text not null,
  scoreboard   jsonb,
  final_score  numeric,
  n_emails     int not null,
  forced       boolean not null default false,
  created_at   timestamptz not null default now()
);
```

Re-running a stage does `insert ... on conflict (email_run_id) do update`, so rows are replaced,
never duplicated. `llm_calls` is append-only: every attempt is a row.

### 2. The LLM seam: `src/agents/llm-client.ts`

```ts
export interface LlmRequest { model: string; system: string; user: string; maxTokens: number; project: string }
export interface LlmResponse { text: string; model: string | null; usage: { inputTokens: number; outputTokens: number }; costUsd: number | null; latencyMs: number }
export interface LlmClient { complete(request: LlmRequest): Promise<LlmResponse> }
```

`proxyLlmClient()` adapts the existing `chat()` in `src/llm.ts`, which already speaks the proxy's
fixed wire contract. `chat()` takes a project label instead of a `Caller`, so the worker's spend
shows as `retina-worker`. A proxy 5xx, 429 or timeout is a `RetryableError`; a 4xx is a
`TerminalError`. Retries are BullMQ's, not the client's.

`__fakes__/fake.llm-client.ts`: built from a function or a queue of replies; records every request.
No test reaches the proxy.

### 3. Structured output: `src/agents/structured.ts`

```ts
callStructured<T>(deps, { step, prompt, input, schema, runId, emailRunId? }): Promise<{ value: T; promptVersion: string; model: string }>
```

1. System message: the prompt text with `{{schema}}` replaced by the JSON schema of `schema`.
2. User message: the input as labelled sections.
3. Extract JSON: the first fenced json block, else the first balanced `{ ... }`.
4. `schema.safeParse`. On failure, one more call with the validation issues appended.
5. One `llm_calls` row per attempt, ok or not. A second failure is a `TerminalError`.

### 4. The prompt: `src/agents/prompts/classify/v1.md`

Frontmatter: `step: classify`, `version: v1`, `model: haiku`, `max_tokens: 400`. `model` is a
proxy alias from `proxy/proxy.yaml` and `LLM_MODEL_CLASSIFY` overrides it. `prompts/registry.ts`
loads the file, validates the frontmatter with zod, and returns the highest version on disk
(versioned activation is phase 4).

The body defines the five categories in the organisers' terms:

- `BL_COMPARISON`: a request about checking a draft Bill of Lading against the Shipping
  Instruction. It includes a request to send the draft BL for checking when nothing is attached
  yet: the README counts those as comparison requests that cannot be compared yet.
- `SI_REQUEST`: a request to provide or prepare a Shipping Instruction.
- `INVOICE_QUERY`: a question about billing, charges, freight totals or cancelling an invoice.
- `GENERAL`: operational messages that ask for none of the above: status summaries, reports,
  reminders, automated notices, HR and holiday notes.
- `SPAM`: unsolicited marketing, prize, parcel fee, mailbox or phishing mail.

It says that a body may contain a forwarded thread, a signature and an external-sender banner,
and that the category follows what the sender is asking for now, not the boilerplate. That comes
from the README's note on bodies. It states no sender, domain, subject code or phrase.

Output schema:

```ts
z.object({ category: Category, confidence: z.number().min(0).max(1), rationale: z.string().max(600) })
```

### 5. Classify input: `src/pipeline/classify/input.ts`

Pure. `buildClassifyInput(email, attachmentNames)` returns `{ from, subject, attachments, body }`
with the body cut at `CLASSIFY_BODY_CHARS` (default 4000) and a marker when it was cut. Nothing
else is removed, reordered or normalised.

### 6. Classify processor (replaces the phase 1 body)

```
if run is cancelled: return
setStage(classifying)
input  = buildClassifyInput(email, attachment names)
result = callStructured(classify, input)
classifications.upsert({ gen_category, gen_confidence, final_category: gen_category,
                          decided_by: "llm", rationale: { generator }, model, prompt_version })
setStage(classified)
if final == BL_COMPARISON: enqueue compare
else: setStage(done, outcome = "not_comparable")
```

`CLASSIFY_CONCURRENCY` should not exceed what the proxy serves at once. The `claudecli` provider
in `proxy/proxy.yaml` runs 2 calls at a time, each a full `claude -p` session, so a run of 520 is
tens of minutes. Develop against the holdout ids (`POST /runs { emailIds }`, about 100 emails).

### 7. Compare processor (placeholder)

Upsert `comparisons { status: "OK", has_defect: false, detail: { placeholder: true } }`, stage
`done`, outcome `OK`. Phases 5 and 6 replace this.

### 8. Submission builder: `src/ontology/submission.ts`

```ts
buildSubmission(db, runId): Promise<{ payload: Record<string, SubmissionRow>; incomplete: string[] }>
```

One SQL join over `email_runs`, `classifications`, `comparisons` and (from phase 6) `field_diffs`.
Every row is parsed with the `SubmissionRow` schema before it leaves, so a value outside the
enums cannot be submitted.

```
category      = human_category ?? final_category
status        = comparisons.status ?? "OK"
review_reason = comparisons.review_reason          (null unless NEEDS_REVIEW)
has_defect    = status == MISMATCH
defect_fields = status == MISMATCH ? the diff fields (phase 6; none now) : []
decided_by    = "llm"
```

Emails whose stage is not `done` or `review` go in `incomplete`, a `failed` email included. An
email with no `classifications` row is submitted as `GENERAL` / `OK`, the scorer's own default for
a missing email, and is listed in `incomplete`.

### 9. Routes

| Route | Behaviour |
|---|---|
| `POST /runs/:id/submit?force=false` | build; if `incomplete` is non-empty and not forced, 409 `{ incomplete }`; else store the payload in MinIO at `submissions/{runId}/{ts}.json`, `POST {EMAIL_SERVER_URL}/submit`, store a `submissions` row with the scoreboard and `final_score`; return `{ submissionId, finalScore, scoreboard }` |
| `GET /runs/:id/submission.json` | the current payload, built live |
| `GET /runs/:id/submissions` | history with `final_score`, `created_at`, `forced` |
| `GET /eval/runs/:id` | dev only, 404 when `EVAL_GROUND_TRUTH_PATH` is unset: `{ full, holdout, wrong: { stage1, stage3, e2e } }` |

A failure of the inbox's `/submit` (503 when the ground truth is not mounted) is a 502 with its
message.

### 10. Eval harness: `src/eval/`

- `ground-truth.ts`: reads `EVAL_GROUND_TRUTH_PATH`, zod-validated against the enums above; a
  clear error when unset. Nothing outside `eval/` imports it.
- `split.ts` (`pnpm eval:split`): stratified 80/20 with a seeded PRNG (seed 42), `round(0.2 * n)`
  per stratum with a minimum of 1 when `n >= 2`; writes `backend/eval/split.json`. The stratum is
  `(category, review_reason, has_defect)`. `has_defect` is there because half the final score is
  the end-to-end rate over the defect emails alone, and chance could leave a holdout with very
  few of them. Commit the file and never regenerate it unless the dataset changes.
- `score.ts`: a port of `scoring.py`, function by function, same defaults and the same JSON shape.
  `scoreAll(truth, sub, { only })` scores a subset, which is how the holdout is scored.
- `parity.ts` (`pnpm eval:parity`): scores `sample_submission.json` and several seeded noisy
  submissions with both `score.ts` and `score_cli.py --json`, and asserts every number agrees to
  four decimals. The noisy submissions are built in memory and reach Python through a temp file:
  a committed fixture derived from the answer key would be a copy of it.
- `run-eval.ts` (`pnpm eval:score --run <id> [--holdout] [--json]`): builds the submission from
  Postgres, scores the full set and the holdout, prints the scoreboard and the stage 1 confusion
  matrix, lists the wrong ids per axis, writes `backend/eval/reports/<runId>.json` (gitignored).

### 11. Frontend

- Run row: a Submit button; on 409 it shows the incomplete count and "Submit anyway" (force).
- Score card: `final_score`, stage 1 macro-F1, stage 3 defect-F1, end-to-end rate, escalation
  recall and precision, LLM calls and cost for the run. Last submission plus history.
- Dev-only holdout card from `GET /eval/runs/:id`, hidden on 404.
- `api-client.ts` mirrors the enums and the scoreboard shape by hand.

### 12. Tests

- `pipeline/classify/input.test.ts`: fields passed through unchanged, body cap and marker.
- `agents/structured.test.ts`: fenced and bare JSON, retry on invalid output, `TerminalError`
  after the second failure, one ledger row per attempt.
- `agents/prompts/registry.test.ts`: frontmatter validation, env model override, unknown step.
- `queues/processors.test.ts` with `FakeLlmClient`: a comparison email goes on to compare; any
  other category finishes `not_comparable`; a category outside the enum never reaches the
  database; a cancelled run is left alone.
- `ontology/submission.test.ts`: every email present, incomplete detection, human category
  override, a row outside the enums is refused.
- `contracts.test.ts`: each enum equals the organisers' list, read from `scoring.py`'s constants
  as written in the test, so a drift fails.
- `eval/score.test.ts`: small truth and submission pairs with hand-computed values, including the
  missing-email default and the not-routed rule.
- `eval/split.test.ts`: every stratum with `n >= 2` has a holdout id; train and holdout are
  disjoint and cover every id; the same seed gives the same split.

### 13. Manual verification

```bash
pnpm eval:split && git add eval/split.json
pnpm eval:parity                                   # both scorers agree
# a run over the holdout ids, then the full inbox:
pnpm eval:score --run <id> --holdout
curl -s -X POST localhost:8091/runs/<id>/submit -H "authorization: Bearer $TEAM_API_KEY" | jq .finalScore
```

## Exit checklist

- [ ] `pnpm eval:parity` passes: the TS scorer and `score_cli.py` agree to four decimals.
- [ ] No rule decides a category: nothing under `pipeline/classify/` or in the classify processor
      branches on sender, subject or body content, and the prompt names no sender, domain, subject
      code or phrase from the dataset.
- [ ] Every enum value in the database, the contracts, the frontend mirror and the submission is
      one of the organisers'; the check constraints and `contracts.test.ts` hold it there.
- [ ] Zero-shot stage 1 macro-F1 at or above 0.90 on the holdout, with the model recorded.
- [ ] Submit from the UI shows `final_score`; `pnpm eval:score` gives the same number on the full set.
- [ ] The submission includes all 520 ids; one `llm_calls` row per attempt with tokens, cost and latency.
- [ ] Holdout numbers for phase 2 recorded in the `PROGRESS.md` scores table.
- [ ] `eval/split.json` committed; `eval/reports/` gitignored.

## Hand-off notes for phase 3

- Nothing in the pipeline changes in phase 3. It is pure deployment.
- The box's `EMAIL_SERVER_URL` is `http://inbox:8000`, already in `deploy/compose.yaml`.
- The worker on the box needs the proxy reachable at `LLM_PROXY_URL`, as the api already does.
