# Phase 12: Hardening and demo

## Goal

Nothing surprising happens on stage. The system is tested against a dataset it has never
seen, every failure mode from the deep dive has been drilled once, the demo is scripted and
timed, and the docs match the code.

## Prerequisites

Phases 1 to 11 merged and deployed. Best prompt set recorded in `PROGRESS.md`.

## Scope

In: fresh-seed test, failure drills, rate-limit drill, demo data and script, pre-seeded
fallback run, docs and README final pass, release tag. Out: new features.

## Work items

### 1. Fresh-seed test

```bash
cd emails/data_v2
pip install openpyxl python-docx reportlab pillow
python3 generate.py --seed 7 --n 500 --out /tmp/sdoc-seed7
```

Point a local Averis container at `/tmp/sdoc-seed7` (compose override with a different
volume and `ground_truth.json` mounted), set `EVAL_GROUND_TRUTH_PATH` to its ground truth,
run the full pipeline locally, score with `pnpm eval:score` on the full set (no holdout for a
fresh seed). Compare component by component with the seed-42 full-set score. Investigate
every email that is wrong on seed 7 and right on seed 42; fix generalisation issues in rules,
harvest, normalisers or prompts; re-run both seeds; both must stay within 0.05 of each other
on `final_score`. Record both in `PROGRESS.md`. Repeat with `--seed 2026 --n 300` as a
second sample if time allows.

### 2. Failure drills (each once, on the box, with a small run of 40 emails)

| Drill | How | Expected | Runbook line |
|---|---|---|---|
| Proxy down | `pkill -f "uvicorn llm_proxy"` for 2 minutes | jobs retry with backoff; some failure cases if beyond 3 attempts; `/health` shows `llmProxy: down`; after restart, retry from the review inbox clears them | yes |
| doc-extract OOM | `docker compose stop doc-extract` | failure cases on comparison emails; retry works after start | yes |
| Redis restart | `docker compose restart redis` | AOF restores waiting jobs; stalled active jobs re-run; no duplicate rows (`unique (run_id, email_id)` holds) | yes |
| Worker crash | `docker compose kill worker` then `up -d worker` | stalled jobs picked up within `stalledInterval`; run completes | yes |
| ngrok down | `pkill ngrok` | frontend shows backend unreachable; pipeline continues; restart via runbook | yes |
| Averis restart | `docker compose restart averis` during ingestion | ingest tick fails, retries, resumes | yes |
| Postgres restart | `docker compose restart postgres` | api `/health` 503 briefly; api and worker reconnect (pool retry); auto-deploy does not roll back on a transient 503 shorter than its poll window | verify and note |
| Bad deploy | push a commit that returns 500 from `/health` | auto-deploy rolls back api and worker; revert commit | yes (done in phase 3, repeat) |

### 3. Rate-limit drill

`LLM_MAX_CONCURRENCY=2` on the box for one full run: no failures, longer duration; record the
duration. Restore to 8.

### 4. Demo preparation

- Pin the best prompt set as the default in `prompt_versions.active`.
- Set client tiers for the demo (two tier-1 customers).
- Pre-seed: complete one full run the day before (the "fallback run") and submit it; keep its
  id in the demo script. If the live run misbehaves, switch to the fallback run's page.
- Prepare the demo review cases: know the ids of one `missing_value` case (516 to 520 on seed
  42), one scanned case (512 to 514), one wrong doc (501 to 505), one mismatch with two fields.
- Prepare the two chat questions and confirm their answers.
- Prepare one candidate lesson (from a real correction) left in `candidate` state to approve
  live; know its before/after numbers.
- Browser: log in beforehand; a second tab with the runbook; a terminal on the box with
  `docker compose logs -f worker` in case judges ask to see it.

Demo script (7 minutes, from `01-product.md` section 5), with timings:

| Minute | Action | What to say |
|---|---|---|
| 0:00 | Start a run at 2 emails/s from `/runs` | the inbox is a stream; every email becomes a job; two queues |
| 0:45 | Run page: funnel and feed moving; point at verifier share and cost | the model classifies every email, nothing is fitted to the sample; a second model checks only on doubt |
| 1:30 | Open a spam trace, then a comparison trace | evidence for the decision: rule reasons, model rationale |
| 2:30 | Open the two-field mismatch | extracted values with quoted lines; deterministic comparison; exact fields flagged |
| 3:30 | `/review`: scanned case with page image and provisional result; missing-value case, correct it, watch it resolve | escalate with evidence, never guess; the human fixes it in one click; the report updates |
| 5:00 | `/chat`: the two questions | the ontology answers questions the dashboard did not anticipate |
| 6:00 | Submit the run; show score next to the fallback run | measured, not claimed |
| 6:30 | `/eval`: approve the prepared lesson | the system learns from the reviewer, gated by a human and by the score |

Rehearse twice from a cold start (fresh browser session, worker restarted).

### 5. Docs and repo final pass

- `03-infra-deep.md`: every route, table and contract matches the code (walk `contracts.ts`,
  migrations and `routes/` and fix the doc, not the code).
- `deploy/README.md`: complete runbook including the drills' recovery steps.
- Root `README.md`: what it is, architecture picture from `02-infra-overview.md`, quick start,
  links to the docs, score table.
- `PROGRESS.md`: all phases closed; scores table complete; "Verified on the box" filled.
- Remove dead code and unused env vars; `pnpm type-check`, `pnpm test`, `ruff`, `pytest` green.
- Tag `v1.0.0` on `main`.

### 6. Submission package (if the organisers want files)

`pnpm eval:export --run <fallback run id>` writes `submission.json`, the scoreboard JSON, and
a one-page `METHOD.md` (generated from `01-product.md` sections 3 and 4 plus the score table)
into `dist/submission/`.

## Tests

No new unit tests. The fresh-seed run is the test.

## Exit checklist

- [ ] Seed-7 final score within 0.05 of seed-42 full-set score; both recorded.
- [ ] Every drill in the table executed once with the expected result; runbook updated.
- [ ] Concurrency-2 run completed without failures; duration recorded.
- [ ] Demo rehearsed twice end to end from a cold start; fallback run submitted and its id in the script.
- [ ] Docs match code; `v1.0.0` tagged; CI green on the tag.
- [ ] `ground_truth.json` absent from the repo history (`git log --all -- '**/ground_truth.json'` empty).
