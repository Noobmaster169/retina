# Phase 2: Rules classifier, submission, first score

## Goal

A real number from the organisers' scorer, produced by deterministic code only, plus a local
eval harness that reproduces that number on a holdout split. From here on every change is
measured.

## Prerequisites

Phase 1 complete: runs ingest end to end, both processors exist, `/runs` page works.

## Scope

In: rules engine, `classifications` and `comparisons` persistence, submission builder, submit
route, eval split, TS port of the scorer, eval CLI, score card in the UI. Out: any LLM call,
any attachment parsing.

## Work items

### 1. Migration `002_classifications_comparisons.sql`

```sql
create table core.classifications (
  id               bigserial primary key,
  email_run_id     bigint not null unique references core.email_runs(id) on delete cascade,
  rule_category    text,
  rule_confidence  numeric,
  rule_reasons     text[] not null default '{}',
  gen_category     text,
  gen_confidence   numeric,
  ver_category     text,
  ver_confidence   numeric,
  final_category   text not null,
  human_category   text,
  decided_by       text not null check (decided_by in ('rule','llm','verifier','human')),
  rationale        jsonb not null default '{}'::jsonb,
  prompt_version   text,
  created_at       timestamptz not null default now()
);

create table core.comparisons (
  id             bigserial primary key,
  email_run_id   bigint not null unique references core.email_runs(id) on delete cascade,
  status         text not null check (status in ('OK','MISMATCH','NEEDS_REVIEW')),
  review_reason  text check (review_reason in ('wrong_doc_type','missing_attachment','unreadable','missing_value','low_confidence','processing_error')),
  has_defect     boolean not null default false,
  decided_by     text not null default 'rule',
  detail         jsonb not null default '{}'::jsonb,
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

Re-running a stage does `insert ... on conflict (email_run_id) do update` so rows are
replaced, never duplicated.

### 2. Rules engine: `src/pipeline/classify/rules.ts`

Pure function. Input is a `ClassifyInput`; output is a `RuleResult`.

```ts
export interface ClassifyInput { senderDomain: string; senderLocal: string; subject: string; body: string; attachmentNames: string[] }
export interface RuleResult { category: Category | null; confidence: number; reasons: string[] }
```

`normaliseSubject(s)`: strip leading reply/forward markers repeatedly
(`/^\s*(RE|FW|FWD)\s*[_:]\s*/i`), collapse whitespace, uppercase for matching.

Rules are evaluated in order; the first match wins. Each rule appends a reason string such as
`subject:TO_CONFIRM_DOCS`.

| # | Condition | Category | Confidence |
|---|---|---|---|
| 1 | sender domain in `SPAM_DOMAINS` (seeded from `clients` where `kind = spam`; initial list: `webmail-verify.co`, `secure-mailbox.org`, `parcel-track.co`, `logistics-deals.biz`, `prize-claims.info`, `crypto-invest.net`) | SPAM | 0.99 |
| 2 | sender is `documentation@`, `operations@`, `rpa.bot@`, `hr@`, `noreply@` at an internal domain (`aprilasia.com`, `april.com.my`) | GENERAL | 0.90 |
| 3 | subject contains `TO CONFIRM DOCS` or `REQUEST BL DRAFT`, or matches `/DRAFT BL .* AMEND/`, or starts with `(AIE|AFPTME|AFRT|AFEMY) - ` | BL_COMPARISON | 0.95 |
| 4 | subject starts with `SI - `, or contains `CUST SI`, `REQUEST SI`, `SI NEEDED`, `LATEST SI` | SI_REQUEST | 0.95 |
| 5 | subject contains `RAK BILLING`, `MISSING GR`, `CANCEL INVOICE`, `LOCAL CHARGES`, `D & D`, `D&D`, `TOTAL FREIGHT`, `TELEX RELEASE CHARGES` | INVOICE_QUERY | 0.90 |
| 6 | subject contains `UPDATE SUMMARY`, `BERTHING REPORT`, `_REMINDER_`, `_RPA_`, `OUTSTANDING BL`, `PENDING BL RELEASE`, `TIME OFF`, `NEW YEAR`, `DELIVERY PLANNING`, `MISS CONNECTION` | GENERAL | 0.85 |
| 7 | subject or body matches spam phrasing: `WON`, `GIFT CARD`, `CLAIM NOW`, `GUARANTEED .* RETURNS`, `VERIFY (YOUR )?ACCOUNT`, `STORAGE IS FULL`, `UNPAID CUSTOMS`, `HOT SINGLES`, `WEIRD TRICK`, `BANK DETAILS`, `UNDELIVERED MESSAGES`, `AVOID SUSPENSION` | SPAM | 0.85 |
| 8 | body mentions `draft BL` or `draft bill of lading` and one of `check`, `confirm`, `compare`, `verify`, `discrepancy` | BL_COMPARISON | 0.70 |
| 9 | body contains `shipping instruction` and `revert with draft` | SI_REQUEST | 0.70 |
| 10 | body contains `invoice` and one of `GR`, `cancel`, `charges`, `billing` | INVOICE_QUERY | 0.65 |
| 11 | none | null | 0 |

The body used by rules 7 to 10 is the cleaned body from `body-clean.ts`: drop everything from
the first quoted-thread separator (`____`, `From:` line preceded by a blank line, `-----Original`)
onward, drop the external-sender warning banner, drop signature blocks (from `Best Regards`,
`Regards,`, `Thank you` at line start to the end). Cleaning is a pure function with tests.

Reason strings are stored; they appear in the trace UI and as evidence for the LLM in phase 4.

### 3. Classify processor (replace phase 1 body)

```
input = buildClassifyInput(email, attachments)
rule = classifyByRules(input)
final = rule.category ?? "GENERAL"
classifications.upsert({ emailRunId, rule_*, final_category: final,
                          decided_by: "rule", rationale: { rule: rule.reasons } })
emailRuns.setStage(classified)
if final == BL_COMPARISON: enqueue compare
else: emailRuns.setStage(done, outcome = "not_comparable")
```

### 4. Compare processor (placeholder)

Upsert `comparisons { status: "OK", has_defect: false, decided_by: "rule", detail: { placeholder: true } }`,
stage `done`, outcome `OK`. Phase 5 and 6 replace this.

### 5. Submission builder: `src/ontology/submission.ts`

```ts
buildSubmission(runId): Promise<{ payload: Record<string, SubmissionRow>; incomplete: string[] }>
```

One SQL join over `email_runs`, `classifications`, `comparisons` for the run. Per email:

```
category      = human_category ?? final_category
status        = comparisons.status ?? "OK"
review_reason = status == NEEDS_REVIEW ? (reason in scorer's list ? reason : null) : null
has_defect    = status == MISMATCH
defect_fields = status == MISMATCH ? field_diffs (phase 6; [] now) : []
decided_by    = classifications.decided_by == "rule" ? "rule" : "llm"
```

Emails whose stage is not `done`, `review`, or `failed` go in `incomplete`. Emails with no
`classifications` row get `GENERAL / OK` and are listed in `incomplete`.

### 6. Routes

| Route | Behaviour |
|---|---|
| `POST /runs/:id/submit?force=false` | build; if `incomplete` non-empty and not forced → 409 `{ incomplete }`; else store payload to MinIO `submissions/{runId}/{ts}.json`, `POST {EMAIL_SERVER_URL}/submit`, store `submissions` row with scoreboard and `final_score`; return `{ submissionId, finalScore, scoreboard }` |
| `GET /runs/:id/submission.json` | current payload (built live) |
| `GET /runs/:id/submissions` | history with `final_score`, `created_at`, `forced` |

Averis `/submit` failures (503 when ground truth not mounted) → 502 with the message.

### 7. Eval harness: `src/eval/`

`ground-truth.ts`: reads `EVAL_GROUND_TRUTH_PATH`; throws a clear error when unset (the VPS
never sets it). Schema-validated with zod.

`split.ts` (`pnpm eval:split`): stratify by `(category, review_reason ?? "none")`; for each
stratum shuffle with a seeded PRNG (seed 42), take `round(0.2 * n)` with a minimum of 1 when
`n >= 2`; write `eval/split.json` `{ seed, train: string[], holdout: string[] }`. Commit it.
Never regenerate unless the dataset changes.

`score.ts`: port of `scoring.py` function by function, same names
(`scoreStage1`, `scoreStage3`, `scoreReliability`, `scoreEndToEnd`, `scoreAll`), same defaults
(missing email → `GENERAL`, `pred_defect` forced false when not routed, exact set equality,
weights 0.30/0.20/0.50). Returns the same JSON shape so the UI can render either source.
`scoreAll(truth, sub, { only?: string[] })` filters truth to the given ids for the holdout.

`run-eval.ts` (`pnpm eval:score --run <id> [--holdout] [--json]`): builds the submission
from Postgres, scores on full set and holdout, prints a scoreboard and the stage 1 confusion
matrix, lists the ids that are wrong per axis, writes `eval/reports/<runId>.json` (gitignored).

`pnpm eval:parity`: scores `emails/data_v2/sample_submission.json` and
`eval/fixtures/parity-submission.json` (a hand-made submission with a mix of right and wrong
answers) with both `score.ts` and `python3 score_cli.py --json`, asserts equality to 4 decimals
on every numeric field. This is the test that proves the port.

Route `GET /eval/runs/:id` (dev only: returns 404 when `EVAL_GROUND_TRUTH_PATH` is unset)
returns `{ full: scoreboard, holdout: scoreboard, wrong: { stage1: [...], stage3: [...], e2e: [...] } }`.

### 8. Frontend

- Run row and run page: "Submit" button → `POST /runs/:id/submit`; on 409 show the incomplete
  count and a "Submit anyway" option (force).
- Score card: `final_score`, stage 1 macro-F1, stage 3 defect-F1, end-to-end rate,
  escalation recall and precision, rule share. Last submission plus history list.
- Dev-only holdout card from `GET /eval/runs/:id` (hidden when 404).

### 9. Tests

- `pipeline/classify/rules.test.ts`: table-driven, at least 40 cases covering every rule,
  reply prefixes, the `AIE - ` coded subject, SI_REQUEST bodies that contain full SI details
  (must not become BL_COMPARISON), GENERAL senders, spam phrasing without a spam domain, and
  the null case. Fixtures copied from real dataset subjects into `test/fixtures/subjects.json`.
- `pipeline/classify/body-clean.test.ts`: banner removed, quoted thread removed, signature
  removed, request sentence preserved.
- `ontology/submission.test.ts`: every email present, incomplete detection, human category
  override, decided_by mapping.
- `eval/score.test.ts`: known small truth/sub pairs with hand-computed expected values,
  including the missing-email default and the not-routed rule.
- `eval/split.test.ts`: every stratum with `n >= 2` has at least one holdout id; train and
  holdout are disjoint and cover all ids.

### 10. Manual verification

```bash
pnpm eval:split && git add eval/split.json
pnpm eval:parity                                # both scorers agree
# start a full run, wait for done, then:
pnpm eval:score --run <id> --holdout
curl -s -X POST localhost:8091/runs/<id>/submit -H "authorization: Bearer $TEAM_API_KEY" | jq .finalScore
```

## Exit checklist

- [ ] `pnpm eval:parity` passes: TS scorer and `score_cli.py` agree to four decimals.
- [ ] Rules-only run: stage 1 macro-F1 at or above 0.85 on the holdout; SPAM 40/40 on the full set.
- [ ] Submit from the UI shows `final_score`; the same number appears from `pnpm eval:score` on the full set.
- [ ] Submission includes all 520 ids; `decided_by` is `rule` for every row.
- [ ] Holdout numbers for phase 2 recorded in `PROGRESS.md` scores table.
- [ ] `eval/split.json` committed; `eval/reports/` gitignored.

## Hand-off notes for phase 3

- Nothing in the pipeline changes in phase 3. It is pure deployment.
- Record the box's `EMAIL_SERVER_URL` as `http://averis:8000` in `deploy/.env.example`.
