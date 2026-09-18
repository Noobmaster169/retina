# Progress

Current phase: 2

## Scores
| Phase | Holdout final | Full final | Stage1 | Stage3 | E2E | Notes |
|---|---|---|---|---|---|---|
| 1 | n/a | n/a | n/a | n/a | n/a | No classification yet: every email ends `done` / `OK` |

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
- [x] pnpm test and pnpm type-check pass (68 backend tests; frontend type-check and lint clean);
      no `process.env` outside `config.ts`

## Deferred
- Worker, Redis and MinIO on the VPS, phase 3. After this merges the box still runs only the api,
  which boots without them and reports `redis` and `minio` as `down` in `/health` (HTTP 200).
  `/runs` answers 503 there until phase 3.
- `pnpm test` in CI, phase 3. The suite needs Postgres; the workflow only type-checks today.
- Graceful shutdown of the ingest job (SIGTERM, `moveToDelayed`) is covered by the replay unit
  test only. Windows cannot deliver SIGTERM to the node process, so it was not exercised live.
  Exercise it on the box in phase 3. The hard-kill path was exercised live and works.
- Attachments are copied per run (250 objects each). Dedupe by sha256 later if disk matters.
- `core.clients` exists and is empty. Phase 2 seeds the spam domains, phase 9 the tiers.

## Verified on the box
- proxy image passthrough: unknown
- proxy concurrency 8: unknown
- `subscription` alias maps to: unknown
- BullMQ job.changePriority available: unknown (installed BullMQ is 6.3.6; `Job.changePriority` is in its types)

## Found while building
- BullMQ 6 rejects a custom job id containing `:`, and `job.discard()` no longer exists.
- `minio/minio` is gone from Docker Hub; `quay.io/minio/minio` and `quay.io/minio/mc` work.
- A BullMQ job with a priority waits in `prioritized`, not `waiting`. Count and cancel both.
- With Redis down, a BullMQ command waits forever. Anything called from a request needs a timeout.
