# Progress

Current phase: 4, in progress on `phase-04-classification-quality`. Everything is built and
tested; what is left is measurement on the holdout, which the user runs (see "Phase 4" below for
the exact runs and commands). Development runs stay at the 30-email dev sample.

Phase 3: closed. The code is merged to `main`; the box is not deployed yet. Everything
that could be built and tested without SSH access to the Monash box is done and green in
`deploy/sim` (18 checks). The one manual step left, and everything to check after it, is
`docs/phases/phase-03-handover.md`, written for whoever has that access. Phase 2 merged to
`main` on 2026-09-19 with its exit checklist green.

A full-codebase review closed phase 3, merged on 2026-09-19. Its findings and how each was
checked are under "Phase 3 code review" below.

**Starting phase 4: read `docs/phases/phase-04-handover.md` before the phase 4 spec.** The review
changed three things phase 4 builds directly on, and `phase-04-classification-quality.md` has been
corrected where it described the old behaviour:

- Retry is decided by the proxy's own `retryable` verdict, never by a status code. The spec's
  original "retries 429, 502, 503, 504" rule is what caused the bug the review found; written that
  way again it requeues a wrong `LLM_MODEL_*` alias forever without spending an attempt.
- `LlmProxyError`, `EmailServerError` and `ScorerRefused` are one `UpstreamError`. `isRetryable`
  is gone.
- The frontend parses every response with zod under `lib/api/`. A new contract field is a schema
  there, not an interface, and `getRun` / `listRunEmails` / the four organisers' enums were
  deleted as unused: the run page brings them back from `git show d68ed1b^`.

## Scores
| Phase | Holdout final | Full final | Stage1 | Stage3 | E2E | Notes |
|---|---|---|---|---|---|---|
| 1 | n/a | n/a | n/a | n/a | n/a | No classification yet: every email ends `done` / `OK` |
| 2, prompt v1 | 0.2129 | not run | 0.7098 holdout | 0 | 0 | Zero-shot sonnet. All 25 holdout SI_REQUEST read as BL_COMPARISON: the definition was wrong |
| 2, prompt v2 | 0.2981 | incomplete, see below | 0.9938 holdout (103 of 104) | 0 | 0 | Zero-shot sonnet, categories defined by paperwork stage. Stage 3 and E2E are 0 until phases 5 and 6 read the documents |
| 2, prompt v3 | 0.3000 | 0.2992 | 1.0000 holdout (104 of 104) | 0 | 0 | `v2` with the schema as a provider constraint: no "reason briefly" ending, `rationale` first in the schema, no `max_tokens`. Holdout run `0a8ed5a5`, 104 calls. Full run `044367f9`, 520 calls, 0 failed, stage 1 macro-F1 0.9975 (518 of 520). Fixes `v2`'s only miss, `email_504` |
| 4, v3 + verifier, dev sample | not run | not run | 1.0000 dev (30 of 30) | 0 | 0 | Run `0d09d887`, 30 train emails, 37 calls, 0 failed, verifier on 7 (23.3%), agreed every time. Not a holdout number |

Stage 1 carries 0.30 of the final score, so 0.3000 is exactly what a perfect classifier with no
document check gets, and `v3` is there. The holdout final cannot rise further until phase 5.

## Phase checklists
### Phase 1 (done, 2026-09-19, local)
- [x] POST /runs ingests all 520 emails; email_runs has 520 rows at done
      (run 4d04592a at 5/s: 520 rows, 520 distinct emails, all `done`, 0 retried)
- [x] Every attachment in MinIO with matching sha256 (250 objects)
      (250 of 250 objects match sha256 and size; 126 SI + 124 BL; 250 listed under the run prefix)
- [x] Worker kill and restart finishes the run with no duplicates
      (force-killed at 107 done with one email in `classifying` and its job orphaned `active`;
      the ingest job was reclaimed about 25 s after restart, the classify job after its 120 s lock;
      final state 520 `done`, nothing stuck)
- [x] Pause and resume work
      (paused at 38, still 38 five seconds later, resumed from the next email)
- [x] /runs page shows counts moving; unauthenticated visit redirects to /login
      (checked in a browser with `SITE_PASSWORD` set: redirect to `/login?next=/runs`, sign in, a
      60-email run appeared and reached 60 / 60 with no reload)
- [x] /health reports all checks; stopping MinIO flips to degraded
      (degraded with HTTP 200 while MinIO was stopped, ok again after it started)
- [x] pnpm test and pnpm type-check pass (77 backend tests; frontend type-check and lint clean);
      no `process.env` outside `config.ts`

### Phase 1 code review (2026-09-19)
Ten findings, all fixed on `phase-01-skeleton` before the merge. How each was checked is in brackets.
- [x] A resume could leave two ingest loops on one run, doubling its rate. `core.runs.ingest_epoch`
      (migration 002): every resume raises it, the job carries it, an older loop stands down as
      `superseded`. (Live at 0.5/s, limit 8: paused and resumed inside one sleep, the old loop
      stopped at 2 ingested, the run ended 8 `done`. Same when resumed before the first job began.)
- [x] A resume whose job could not be queued left the run `running` with no job. It returns to
      `paused`. (Route test.)
- [x] `GET /runs` and `GET /runs/:id` were 503 without Redis. `queues` is nullable. (Live with
      Redis stopped: 200 in 40 ms, `queues: null`.)
- [x] A queue command issued while Redis was down was delivered on reconnect, after its caller had
      been told it failed. Commands are refused while the connection is down. (Live: `POST /runs`
      was 503 in 14 ms, the run `failed`, and nothing ran when Redis came back.)
- [x] A rejection inside a worker's async `failed` listener was unhandled and killed the worker.
      Guarded and logged. (By reading; not exercised live.)
- [x] Repeated `emailIds` inflated `totalEmails`. Dropped in `CreateRunBody`. (Route test.)
- [x] A failed job removal made a committed cancel answer 503. Logged instead; the processors
      skip a cancelled run. (Route and processor tests.)
- [x] `ingestEmail` held a transaction and a pooled connection across downloads and uploads.
      Transfers now happen first. (Existing ingest tests; the 520-email run was not repeated.)
- [x] `/api/runs` was in the proxy matcher, so a signed-out poll got the login page as a 200.
      Removed; the handlers answer a JSON 401. `/api/runs/<id>/constructor` is a 404. (Type-check
      and lint only; not opened in a browser.)
- [x] Shutdown and the client components no longer drop errors. (Type-check only.)

### Phase 2 (done 2026-09-19, local)
- [x] `pnpm eval:parity` passes: the TS scorer and `score_cli.py` agree to four decimals
      (7 cases: the sample, an empty submission, the truth itself, and four seeded noisy submissions
      from final 0.0124 to 1.0 with up to 46 end-to-end successes; every number agrees)
- [x] No rule decides a category (nothing under `pipeline/classify/` or in the classify processor
      branches on sender, subject or body; `registry.test.ts` fails if the shipped prompt names a
      sender, domain or subject code from the inbox)
- [x] Every enum is the organisers', value for value (`contracts.test.ts` reads `scoring.py` and the
      README; the check constraints were exercised: three valid rows accepted, six invalid rejected)
- [x] Zero-shot stage 1 macro-F1 at or above 0.90 on the holdout, on `sonnet`
      (`v2`: 0.9938, 103 of 104. The miss is `email_504`, a `wrong_doc_type` case read as SI_REQUEST
      at confidence 0.70. `v1` was 0.7098)
- [x] A clean run of all 520, run `044367f9`: 520 `done`, 0 `failed`, 520 model calls and no
      retries, 5.1 s average, 30.29 USD at API prices. Stage 1 macro-F1 0.9975 on the full set,
      518 of 520; the two misses are `email_502` and `email_505`, both read as SI_REQUEST at 0.62
      and 0.55 confidence, which is again the confidence signal phase 4's verifier triggers on.
      The run is not homogeneous: its first 150 emails went through the local proxy with the schema
      as a provider constraint, the remaining 370 through the box's `/ai/chat`, where the schema
      reaches the model through the prompt only. Both misses fall in the unconstrained half, which
      370 of 520 calls does not make evidence; what is evidence is that no gateway answer failed to
      parse. An earlier attempt under `v2` failed its last 91 emails with "classify/v3.md has bad
      frontmatter" because a second session added a prompt file mid-run; that is what the Deferred
      note on pinning a run's prompt version is about.
- [x] Submit from the UI shows `final_score` and `pnpm eval:score` gives the same number on the
      full set, verified on the 104-email holdout run `0a8ed5a5` submitted through the frontend's
      own route: the organisers' scorer answered 0.09475409836065575 and the local scorer gave
      0.09475409836065575 over all 520. The payload was stored before it was sent.
- [x] That submission over all 520 ids, from run `044367f9`: the organisers' scorer answered
      0.29924983692106977 and `pnpm eval:score` gave 0.29924983692106977 over the same 520.
- [x] One `llm_calls` row per attempt with tokens, cost and latency
      (holdout `v2`: 104 calls, 0 failed, 0 retries, 7.7 s average, 11.87 USD at API prices)
- [x] `eval/split.json` committed (416 train, 104 holdout, 9 of the 46 defects held out);
      `eval/reports/` gitignored
- [x] 169 backend tests, type-check clean in both packages, frontend lint clean; the production
      image builds and boots with no Redis, MinIO or answer key (`/health` 200 degraded, `/eval` 404,
      submit 503). The image check was made when the suite stood at 152 tests and has not been
      repeated since

### Phase 2 review (2026-09-19)
Twelve findings from the review of scope and classify concurrency, plus what the handover left
open. How each was checked is in brackets.
- [x] A short proxy outage permanently failed a run's emails. `LlmUnavailableError` pauses the
      classify queue for 30 s and returns the job without spending an attempt
      (`queues/failure-policy.ts`). (Live: the proxy was killed mid-run with 8 emails in flight.
      8 pauses logged, 0 emails failed, 0 attempts spent, `max(attempt)` still 0, and all 8
      finished `done` once the proxy was back. Also a table-driven unit test.)
- [x] Two restarts mid-call left an email in `classifying` forever. `maxStalledCount: 10`, and a
      job stalled past its allowance is treated as final. (Unit test.)
- [x] A rerun of classify paid twice and could drag a finished email backwards. The processor
      reads the stored classification first and every stage move names the stages it may start
      from. (`processors.rerun.test.ts`.)
- [x] Cancel was not honoured after the model call returned. The status is re-read after it.
      (`processors.rerun.test.ts`.)
- [x] A half-ingested run submitted without `force`. 409 naming how many of how many emails it
      holds. (Route test.)
- [x] The SDK's own retries hid calls and blocked worker slots. `maxRetries: 0`. (By reading.)
- [x] Double submit left an orphan payload. One submission per run at a time, the row written
      before the scorer is called, `recordScore` after, and only scored rows count as the run's
      last submission. (Route tests, and live: with the inbox stopped the submit answered 503 and
      left an unscored row while `lastSubmission` still showed the earlier 0.0947.)
- [x] Truncated output looked like bad JSON. No cap by default, and a `max_tokens` stop is
      terminal. (`structured.test.ts`.)
- [x] Classify concurrency was 4 against a proxy that serves 2. Default and `.env.example` are 2.
- [x] `SubmitResult` and `SubmitRefused` were unused. The route types its bodies with them, and
      `SubmitRefused` gained `forcible` because the Score cell showed every refusal as
      "0 unfinished, submit anyway" with a force button that could not help. (Route test, and live
      through the frontend's own route: 409, "370 emails are not finished", `forcible: true`.)
- [x] `EVAL_GROUND_TRUTH_PATH` was uncommented in `.env.example`. Commented out, so copying the
      file cannot hand the api the answer key.
- [x] The unused `classifications` columns (`ver_category`, `ver_confidence`, `human_category`,
      `decided_by` values `verifier` and `human`) stay: they are the phase 4 verifier and phase 8
      human review, `03-infra-deep.md` already specifies them, and dropping them would cost a
      migration and a local database reset. Decided with the user on 2026-09-19.
- [x] `GET /eval/runs/:id` stays dev-only, off unless `EVAL_GROUND_TRUTH_PATH` is set and 404 on
      the VPS. Decided with the user on 2026-09-19.
- [x] `buildSubmission` held SQL. The query is `emailRuns.listForSubmission`; `assembleSubmission`
      is pure.

The holdout was read a third time, to score `v3`: 1.0000, 104 of 104. `v3` changes only the
prompt's ending and the field order of its schema, both forced by the schema becoming a provider
constraint, and the change was not chosen by looking at holdout emails.

How the holdout was used, stated plainly: it was read twice. The `v1` read is what showed the
SI_REQUEST definition was wrong. The fix came from the organisers' generator, not from the holdout
emails, and was checked on 60 train emails (60 of 60) before the holdout was read again. The 341
train ids in the interrupted full run are the cleaner evidence: none was looked at, all correct.

### Phase 3 (in progress, 2026-09-19)
Deploy only. Nothing under `backend/src` changed except one header in the frontend's api-client.
- [x] What was observed, from outside the box: it serves a pre-phase-1 image. Through the tunnel
      `GET /runs` is 404 with a valid bearer, on a route `main` registers unconditionally, and
      `/health` answers the old `{"status":"ok","database":"up"}` shape. Neither phase 1 nor
      phase 2 is live there.
- [x] Two defects in the deploy scripts can each produce exactly that, and both are fixed. Which
      one actually bit, or both, is unconfirmed until someone reads `~/retina/auto-deploy.log`.
      First: the gate was `"status":"ok"`, and phase 1's `/health` answers `degraded` whenever
      Redis or MinIO is down, which on that box was always, so a phase 1 deploy came up, was read
      as a failure, and rolled itself back. The gate is now `postgres` and `redis` up.
- [x] `deploy/compose.yaml` has redis, minio, minio-init, worker beside postgres, inbox and api.
      One env anchor shared by api and worker. Only `127.0.0.1:8091` published.
- [x] `auto-deploy.sh` keeps `~/retina/compose.yaml` and `~/retina/auto-deploy.sh` in step with
      the clone, so after one bootstrap no phase needs a box login again.
- [x] Second: `proxy/src/retina_proxy.egg-info/` was tracked, and `auto-deploy.sh` runs
      `pip install -e proxy` whenever a push touches `proxy/`. setuptools rewrites those files,
      so the clone dirties itself, and the script's own dirty-tree refusal then skips every run
      after it. Untracked and gitignored. This one would have outlived the health-gate fix, and
      it is why the bootstrap wizard restores a clone dirtied by generated files.
- [x] `deploy/sim/sim.sh test`: 15 of 15 on a fresh simulated box. It found three real bugs, all
      fixed (see below).
- [x] CI gates run on pull requests, `pnpm test` runs against a Postgres service container, and
      the frontend is built.
Everything below needs SSH access to the box, which the machine that built this phase does not
have. `docs/phases/phase-03-handover.md` is the runbook, including what to write back here.
- [ ] `bootstrap-wizard.sh` run on the box; `https://<domain>/health` reports every check up.
- [ ] `~/retina/auto-deploy.log` read, and which of the two defects above actually bit recorded.
- [ ] A 20-email run started from the Vercel page completes on the box and scores through the
      box's inbox.
- [ ] A push to `main` deploys within 5 minutes without manual steps.
- [ ] `ground_truth.json` reaches the `inbox` container and nothing else, confirmed on the box.
- [ ] Nightly backup cron line present; one manual `pg_dump` succeeded.

### Phase 3 code review (2026-09-19)

A full-codebase review, fixed on `review-fixes-phase-03`. How each was checked is in brackets.

- [x] The proxy answered 500 for both an unknown provider and a dead upstream, and the backend read
      `status >= 500` as transient, so `pausingOnLlmOutage` requeued the job with its attempts
      untouched: a typo in `LLM_MODEL_CLASSIFY` looped every 30 s forever, no email ever failed, and
      the only signal was a warn line saying the model was unavailable when it was fine. The proxy
      already computed `retryable` per error class and dropped it in `render_error`; it is on the
      wire now with the stable `code`, `llm-client.ts` reads it, and `app.ts` relays it so the
      verdict survives the gateway hop. (New `llm-client` table test over six status/verdict
      combinations; new proxy e2e test that a 404 is permanent and a 429 is not.)
- [x] `LlmProxyError`, `EmailServerError` and `ScorerRefused` were three copies of one shape, one of
      them without a status, and `app.ts` had grown a branch per service. One `UpstreamError` now,
      carrying status and verdict; the middleware is one branch. Deletes `isRetryable`, which had no
      callers and encoded a fourth, contradictory policy beside the error classes. (Type-check and
      the existing route tests.)
- [x] `TEAM_API_KEY` was optional while a `/ai/chat` `LLM_PROXY_URL` needs it: an unset key sent an
      empty bearer and the 401 failed every email in the run terminally, with the api booting clean.
      `config.ts` refuses to boot that pair. (By reading; the refine is on the Env schema.)
- [x] Two unvalidated HTTP boundaries, against a rule the ingest path already kept: `emails.ts`
      cast the inbox with `as Email[]` and `/v1/models` was cast likewise. Both parse now, the
      inbox against the same `EmailRecord` schema the `Source` seam uses. (Type-check, 188 tests.)
- [x] The whole frontend was the same disease: every response narrowed with `as Type` against
      hand-mirrored interfaces, so a renamed field type-checked on both sides and surfaced as
      `undefined.toFixed()`. zod is a frontend dependency now and every response is parsed.
      (Type-check, lint, build.)
- [x] `api-client.ts` was 374 lines, 187% of the repo limit, holding a transport layer, three
      resource clients and their types. Split into `lib/api/` behind a barrel, so no import site
      moved; `eslint` enforces `max-lines` now and the largest frontend file is 141. (Lint.)
- [x] `GET /runs` hand-merged four maps in the route behind an `if (!stageCounts || !llm) return []`
      that could never fire, since both repositories seed from the ids they are handed. The repos
      return a total lookup instead, so the guarantee is a type fact, and the route is three lines.
      (188 tests, including the existing list-route tests.)
- [x] `claude -p` runs two at a time and nothing watched for client disconnect, so a backend whose
      600 s timeout fired left the call running to the provider's own 1200 s ceiling, holding a slot
      while the requeued job waited behind it. The providers already killed their child on
      cancellation; nothing ever cancelled them. (New proxy test that an abandoned call is killed.)
- [x] `emails/docker-compose.yml` published the inbox on `0.0.0.0:8080`, serving the dataset and
      `POST /submit` to a shared hackathon network, while `backend/compose.local.yaml` scoped the
      same service to loopback and `CLAUDE.md` pointed at the unsafe one. Both bind loopback and the
      docs name one way in. (Read back from both files; sim case A still asserts only the api is
      published.)
- [x] `pnpm eval:parity` is the only proof that `score.ts` still matches the organisers'
      `scoring.py`, and it ran when someone remembered. It gates the publish now, as does `ruff` on
      the proxy, whose `# noqa: BLE001` markers had been suppressing a rule with no config behind
      it. (Parity: 7 cases agree to four decimals. Ruff: clean after one unused import.)
- [x] The health-gate substring, the `REPO`/`STACK`/`IMAGE`/`HEALTH_URL` defaults and the atomic
      install were written out by hand in both deploy scripts. `deploy/lib/stack.sh` holds all
      three. It is sourced before the pull, so the self-update hand-over fires on a library-only
      change too. (`deploy/sim`: 18 passed, 0 failed against this branch, including a new case E
      for exactly that.)
- [x] Surface nothing consumes yet, per the phase rule: `CompareJob.rerunFrom` (parsed, validated,
      never read), `keys.text/page/upload`, and the frontend's `getRun`, `listRunEmails` and the
      four organisers' enums. Phases 5 to 8 add them back with their consumers.
- [x] Doc drift, per rule 5: section 13 of `03-infra-deep.md` claimed a `middleware.ts` gate and a
      `SESSION_SECRET`, both contradicting section 3 of the same document and the actual `proxy.ts`;
      the worker's `depends_on` had become `service_started` without the doc following; `minio-init`
      was missing from the services table; `LLM_PROXY_URL` still showed `172.17.0.1:4000`. The two
      em dashes in user-visible copy are gone.
- [x] `deploy/sim`'s own `cmd_reset` ran `docker compose down -v` from a directory it then deleted,
      so a reset after a half-finished bootstrap left the containers up and their volumes in use,
      and every later run hit the wizard's refusal to generate a `PG_PASSWORD` over an existing
      database. Found by running it. It removes by compose project label first now.

### Phase 4 (in progress, 2026-09-19)
Built: the verifier (`classify-verify/v1`), `decide.ts`, `core.prompt_versions` (migration 004),
prompts pinned per run in `runs.prompt_set`, client retries on the proxy's verdict, the
`LLM_MAX_CONCURRENCY` cap, the dev sample and holdout presets, few-shot `v4` (not active), and
`/runs/[id]` with a live call feed and every call's exact input and output.

The user asked (2026-09-19) that development runs stay at 20 to 30 emails and that anything
larger be theirs to start: from the runs page, or with the commands below. So the holdout items
are open, not failed.

- [ ] Stage 1 macro-F1 on the holdout at or above 0.95, with the verifier. Phase 2's `v3` was
      1.0000 without it. **To run**: runs page, Emails = Holdout, New run; then
      `cd backend && pnpm eval:score --run <id> --holdout`.
- [ ] The full-set confusion matrix. **To run**: Emails = Whole inbox (520). About 40 minutes at
      2 in parallel.
- [ ] The verifier ran on under 25% of emails. Dev sample: 7 of 30 (23.3%), but the sample is six
      of each category and over-weights the categories the generator is least sure of (all 7
      were GENERAL or INVOICE_QUERY, at 0.62 to 0.88). On 401 train emails under `v2`, 24 (6.0%)
      were below 0.9. The holdout run above settles it.
- [ ] The few-shot experiment, with both holdout numbers. `v4` = `v3` + ten train examples, two
      per category, none from the holdout or the dev sample. **To run**: Emails = Holdout,
      Classify prompt = v4. It must beat the `v3` holdout run to ship. Migration 004 seeds no
      `v4` row, so activating it takes a row and two updates in one transaction (the partial
      unique index allows one active version per step at any moment):
      `begin; insert into core.prompt_versions (step, version, notes) values ('classify', 'v4', 'few-shot'); update core.prompt_versions set active = false where step = 'classify' and version = 'v3'; update core.prompt_versions set active = true where step = 'classify' and version = 'v4'; commit;`
      Since `v3` already scored 1.0000 there, it can at best tie; if it does not beat `v3`,
      delete `v4.md` and `examples.v4.json` and record both numbers here.
- [ ] The model comparison: one holdout run per alias under `v3`, Model = haiku, opus,
      qwen3:14b. Record macro-F1, the confusion matrix, cost per email and latency per email:
      `select step, model, count(*), sum(cost_usd), avg(latency_ms) from core.llm_calls where run_id = '<id>' group by 1, 2`.
      The default stays sonnet unless the user changes it.
- [x] Still no rule decides a category; every enum is the organisers'. `needsVerifier` reads the
      generator's confidence and nothing else, and `registry.test.ts` checks the verifier
      prompt and `v4`'s instructions for inbox phrases too.
- [x] Processor tests with `FakeLlmClient` and no network: confident (no verifier), unsure (the
      verifier's category wins), a pinned prompt set, a 503 (retryable, on the ledger), an unknown
      provider (a `TerminalError`, not requeued, through the real client), a verifier that fails
      for good (the generator's category stands), a verifier outage (the retry reuses the
      generator's answer), and a run from before pinning (it gets the active `v3`, not `v4`).
      268 backend tests.
- [x] A run at `LLM_MAX_CONCURRENCY` completed with no 429: the dev run, 2 at a time, 37 calls,
      none failed.
- [ ] Image passthrough on the box: needs SSH access, which this machine does not have.

Parallelism, as the user asked: every run, dev, holdout or all 520, runs `CLASSIFY_CONCURRENCY`
emails at once, and `LLM_MAX_CONCURRENCY` (which follows it when unset) caps the model calls in
flight. Both are read from `backend/.env`, and the runs page shows the values in force. Raise
them together with the proxy's `max_concurrency`, or the extra calls only queue in the proxy.

### What the simulator found (2026-09-19)
`deploy/sim` runs the real deploy scripts against a Docker-in-Docker replica of the box layout.
Three bugs that would each have cost a manual recovery on a box nobody can SSH into from the
dev machine:
- [x] The self-update re-exec started a fresh tick. By then the pull had happened, so
      `HEAD == origin/main` and the second pass exited at the quiet path. A commit that changed
      `auto-deploy.sh` and `compose.yaml` together had its compose change deferred to whatever
      tick came next. The hand-over now carries `AUTO_DEPLOY_FROM`.
- [x] `docker compose up -d --no-deps api worker` still enforces the worker's
      `depends_on: api service_healthy`. A deploy whose api was unhealthy blocked for the
      healthcheck's whole allowance and then aborted, leaving the worker down. Only the api
      migrates, so there was no race to order around: `service_started`.
- [x] The api healthcheck had no `start_period`, so migrations ran against a 30 s clock.

## Design decisions
- 2026-09-19, **no hand-written classification rules.** The original phase 2 was a rules engine
  (spam sender list, subject keyword table, body patterns, body cleaning by pattern), all read off
  these 520 emails. The inbox is one small seeded draw and the judges may score another, so a rule
  fitted to it is an assumption. The LLM classifies every email; prompts describe the task in the
  organisers' words and name nothing from the dataset; the eval harness measures. Phase 2 is now
  "LLM classification, submission, first score" and pulls the minimal LLM layer forward; phase 4
  is "Classification quality" (prompt versions, verifier, gated few-shot, model comparison). The
  same reasoning moved phase 5's "was a comparison requested" from body-verb regexes to the model.
  Cost of the decision: a full run is 520 LLM calls, and the `claudecli` provider serves 2 at a
  time, so tens of minutes instead of seconds. Develop on the holdout ids.
- 2026-09-19, **the organisers' enums, value for value.** `category`, `status`, `review_reason` and
  the seven field names come from `emails/data_v2/README.md` and `scoring.py` and are never
  extended. The design had two extra review reasons, `low_confidence` and `processing_error`; both
  are gone from every doc and from migration 003. A job that fails for good is a failure
  (`email_runs.stage = failed`; from phase 8 a review case of `kind = failure` with no reason), not
  a review reason. A value the extractor cannot locate is a `missing_value`. The party judge always
  decides. The README's status table is enforced by check constraints (verified against the dev
  database: the three valid rows accepted, six invalid ones rejected).

- 2026-09-19, **the document steps go to the model too.** Asked whether phase 5's title-matching
  fingerprint and phase 6's normalisers should stay code, the answer was the model. Document type
  is an LLM call; whether an SI value and a BL value mean the same thing is an LLM call per field
  (the field judge). Code only assembles the fields judged different into `defect_fields` and
  validates the names against the enum, which keeps the submitted set exact. Phases 5 and 6 carry
  an "Amended" section that governs their older work items.
- 2026-09-19, **`sonnet` for every LLM step.** Classify, verify, triage, document type, extraction,
  field judge, chat. `LLM_MODEL_<STEP>` stays for experiments; the default does not move without
  the user saying so.

## Design decisions (phase 4)
- 2026-09-19, **`VERIFY_BELOW = 0.9`**, chosen on train: under `v2`, 24 of 401 train emails
  (6.0%) fell below it, and every miss phase 2 recorded sat at 0.70 or lower.
- 2026-09-19, **`classify v3` is the active row, not `v1`** as the spec's seed said: `v3` is what
  scored 1.0000, and rule 5 says the repo wins for what is built.
- 2026-09-19, **a run pins its prompts when it is created**, in `runs.prompt_set`, which closes
  the Deferred item about a prompt file added mid-run. A run can also name a model per step; it
  must be a proxy alias, checked against `/v1/models` before anything is queued.
- 2026-09-19, **few-shot examples are `examples.<version>.json`**, not `examples.json`, so a
  version and its examples are deleted together if the experiment fails.
- 2026-09-19, **the api may read `backend/eval/split.json` and `dev-sample.json`**, which hold
  ids only, to start a dev or holdout run. It still never reads `ground_truth.json`:
  `eval/id-lists.ts` is split from `eval/ground-truth.ts` so the api does not even import it.

## Deferred
- `deploy/compose.yaml` does not pass `CLASSIFY_CONCURRENCY` or `LLM_MAX_CONCURRENCY`, so the box
  runs the defaults (2 and 2). Add them to the env anchor when the box's proxy serves more, and
  run `deploy/sim` then, since it is the only gate on `deploy/`.
- The verifier agreed on all 7 dev-sample emails it saw. If the holdout shows the same, it is
  costing about one call in five on those categories for nothing; the threshold could come down.
  Decide on the holdout numbers, not on this sample.
- The backend's LLM request timeout (600 s, `REQUEST_TIMEOUT_MS` in `llm.ts`) is still shorter
  than the proxy's worst case for `claudecli` (a 1200 s per-attempt ceiling plus a 1320 s backoff
  ladder), and the two are still set in two files. Phase 4 made the backend's number the one that
  bounds an email: a timeout is `LlmTimeoutError`, never retried inside the client and never
  treated as an outage, so an email that always hangs costs at most three attempts of 600 s and
  then fails. Moving the proxy's ceiling under it would make the proxy the single owner.
- `proxy.yaml`'s `request_timeout_s: 1800` is read by nothing: `config.py` defines the field and no
  code reads it, so it implies a ceiling that does not exist. Delete it or enforce it.
- Ruff runs with `E,F,W,B,BLE`. Import sorting and pyupgrade are off: on the inherited proxy they
  are a wide diff of churn that catches no defects. Turn them on if that code is ever rewritten.
- `deploy/sim` still is not in CI: it needs privileged Docker-in-Docker, which GitHub-hosted runners
  do not give. It runs locally (`./sim.sh test <branch>`) and is the only gate on the deploy
  scripts, so anything touching `deploy/` still needs someone to run it by hand.
- ~~A run does not pin its prompt version.~~ Fixed in phase 4: `POST /runs` pins every step's
  version and model in `runs.prompt_set`, and the worker loads exactly that.
- The Score column was checked over HTTP (server render, the submit and eval handlers, error
  paths), not clicked in a browser: the browser tool failed to connect in the building session.
- A full run is 520 sonnet calls at 2 at a time: about 40 minutes, and about 59 USD at API prices
  (nothing is billed on the subscription rail, but it uses the subscription's limits).
- The box's proxy still runs the code on `main`, which parses `output_config` but never passes it
  to `claude -p`. `auto-deploy.sh` reinstalls and restarts it on any push touching `proxy/`, so the
  merge of this branch is what makes structured output real there. Its `claude` must be 2.1.274 or
  newer; check with `claude --version` before the phase 3 smoke test. There is no proxy image to
  rebuild: the box runs it from the clone, not a container.
- The Score cell was exercised through the frontend's own `/api/runs/:id/submit` route, not clicked
  in a browser: no browser tool in the session that did it, as in the phase 2 build.
- ~~Worker, Redis and MinIO on the VPS, phase 3.~~ In `deploy/compose.yaml` as of phase 3 and
  proven in the simulator. Live on the box once `deploy/bootstrap-wizard.sh` has been run there.
- ~~`pnpm test` in CI, phase 3.~~ Done: a Postgres service container on 5433, and the gates now
  also run on a pull request. The frontend gets `pnpm build` too.
- Graceful shutdown of the ingest job (SIGTERM, `moveToDelayed`) is covered by the replay unit
  test only. Windows cannot deliver SIGTERM to the node process, so it was not exercised live.
  `deploy/sim` can now do it without the box (`docker compose stop worker` against a run that is
  still ingesting), which is a better home for it than a one-off on the box. Not done yet. The
  hard-kill path was exercised live and works.
- Attachments are copied per run (250 objects each). Dedupe by sha256 later if disk matters.
- Structured output is not exercised on the gateway transport. `/ai/chat` has no `output_config`,
  so where `LLM_PROXY_URL` names one, the answer schema reaches the model through the prompt only
  and `structured.ts`'s zod parse is the whole guarantee. The provider constraint is exercised only
  against a proxy we speak the Anthropic wire to. If the box ever exposes `/v1/messages`, delete the
  gateway transport rather than keep two.
- A cancelled run's emails stay at the stage they reached; there is no `cancelled` stage. Add one
  if a later dashboard needs to tell them from emails still in flight.
- One `emailIds` entry that is not in the inbox fails the whole run with a terminal error naming
  it. Kept on purpose: skipping it would leave `totalEmails` unreachable. Validate at `POST /runs`
  if it ever matters.
- A worker that cannot record a final job failure (database down) leaves that email at
  `classifying` or `comparing`. The guard stops the crash, not the missed write. Phase 8's review
  queue should sweep for emails whose job sits in BullMQ's failed set.
- `core.clients` exists and is empty. Phase 9 seeds the tiers. There is no spam list.

## Verified on the box
- proxy image passthrough: unknown
- proxy concurrency 8: unknown
- `subscription` alias maps to: unknown
- BullMQ job.changePriority available: unknown (installed BullMQ is 6.3.6; `Job.changePriority` is in its types)

### Phase 4 code review (2026-09-19)
Two fresh reviewers read the branch with only the diff, CLAUDE.md, the spec and the handover. No
finding gave wrong results on the runs made; each is fixed on the branch. How each was checked is
in brackets.
- [x] A `prompt_set` with a step this code does not know (a later phase's run, read after a
      rollback) failed `GET /runs` and every job of that run. `PromptSet` drops unknown steps.
      (`runs.repo.test.ts`, a run whose set names `extract`.)
- [x] A run created before pinning fell back to the newest prompt file, which is now the
      unvalidated `v4`. It gets the active versions (`completePromptSet`). (Processor test.)
- [x] A timeout was retried twice in the client and then treated as an outage, so one hung call
      held a slot for about 30 minutes and requeued forever. `LlmTimeoutError`: one try, and the
      queue spends an attempt. (Client and gateway tests.)
- [x] A verifier that failed for good failed the email though the generator had answered, and a
      verifier outage paid for the generator again on the retry. The generator's category stands
      with `verifierError` recorded, and a retry reuses the ledger's answer. (Processor tests.)
- [x] The live feed re-downloaded full prompts every 2 s forever. Summaries only, and the run
      page stops polling when `processingDone`. (Route test: no `system` or `user` in the feed.)
- [x] The documented `v4` activation SQL assumed a row migration 004 does not seed. Corrected above.
- [x] Smaller: bad queries in the frontend's pass-through routes read as an outage; `/runs/[id]`
      had no inline error for a down backend; the table blanked on filter change; progress was
      derived in the frontend (now `finishedEmails`, `processingDone`); `LLM_MODEL_*` skipped the
      alias check; a malformed examples file was a 500; `contracts.ts` was over 200 lines;
      `RecordingLlmClient` was missing; the unknown-provider processor test bypassed the client.

## Found while building
- vitest 5 treats a function returned from `beforeEach` as a cleanup hook and calls it. So
  `beforeEach(() => mock.mockReset())` calls the mock after every test, because `mockReset`
  returns it. The old client test only passed because its one-shot rejection was already spent.
  Use a braced body.
- A deploy that is rolled back looks exactly like a deploy that never happened, from outside. The
  box had been serving pre-phase-1 code for two phases; the tell was `GET /runs` answering 404
  with a valid bearer, not anything in a log.
- `~/retina/compose.yaml` and `~/retina/auto-deploy.sh` are copies. A commit alone never reached
  the box: whatever runs on a server has to be able to update itself, or someone has to log in.
- A script that replaces itself must hand over its state, not only its code. Re-exec and the new
  process starts from the top, where the work it was in the middle of no longer looks like work
  to do.
- On Windows `core.autocrlf=true` gives the working tree CRLF, and a CRLF heredoc terminator is
  a syntax error while a CRLF shebang breaks on Linux. `.gitattributes` pins `*.sh` to LF.
- A generated file that is tracked will eventually be rewritten by the tool that generates it,
  and on a server that means a dirty clone. Ours combined with a deploy script that refuses to
  touch a dirty clone, and the two together stopped deployment altogether, quietly, in a log
  nobody was reading.
- Two of the three script bugs here are the same bug: a program that rewrites a file something
  is still reading. bash reads a script as it executes it, so both `auto-deploy.sh` updating
  itself and the wizard pulling the clone it lives in have to move to a new inode first.
- A category definition can be wrong while the model is right. `v1` missed 25 of 25 SI_REQUEST on
  the holdout because it defined the category as "asks for an SI". The organisers' generator shows
  an SI_REQUEST hands the instruction over. Read their definition before blaming the model.
- The model's stated confidence tracks its errors: `v1` left 16 of 104 below 0.8, where its
  mistakes were; `v2` leaves 2, one of them the single miss. That is the phase 4 verifier trigger.
- Two sessions in one checkout collide through the filesystem even without touching the same
  lines: a long-running worker picked up the other session's new prompt file mid-run.
- On Windows the proxy venv is `.venv/Scripts/python.exe`, and port 4000 may belong to another
  project's proxy with different aliases. This repo's proxy runs on 4001 locally.
- The deployed box does not expose its proxy. Probing the ngrok host found `/v1/messages`,
  `/healthz`, `/v1/models` and every guessed path a 404, and the proxy reachable only behind the
  API's `/ai/chat` with a bearer. An unauthenticated probe answers 401 for a path that does not
  exist, because the bearer check runs ahead of routing: read 401 as "not authenticated", never as
  "the route is there".
- Nothing in the backend sends an outbound credential by default. The SDK's `apiKey` goes out as
  `x-api-key` and is a spend label the proxy reads as the project name, not a key.
- A dev machine can lose everything that is gitignored. This one came back with no `backend/.env`,
  no `node_modules`, no proxy `.venv` and empty Docker volumes, so the local database and the
  previous session's runs were gone before this session started.
- BullMQ 6 rejects a custom job id containing `:`, and `job.discard()` no longer exists.
- `minio/minio` is gone from Docker Hub; `quay.io/minio/minio` and `quay.io/minio/mc` work.
- A BullMQ job with a priority waits in `prioritized`, not `waiting`. Count and cancel both.
- With Redis down, a BullMQ command waits forever. Anything called from a request needs a timeout.
- A timeout alone is not enough: the command stays queued and runs on reconnect. Check the
  connection first and refuse (`redisIsDown` in `queues/connection.ts`).
- An EventEmitter drops the promise an async listener returns. Wrap async BullMQ listeners.
