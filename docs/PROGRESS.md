# Progress

Current phase: 1

## Scores
| Phase | Holdout final | Full final | Stage1 | Stage3 | E2E | Notes |
|---|---|---|---|---|---|---|

## Phase checklists
### Phase 1
- [ ] POST /runs ingests all 520 emails; email_runs has 520 rows at done
- [ ] Every attachment in MinIO with matching sha256 (250 objects)
- [ ] Worker kill and restart finishes the run with no duplicates
- [ ] Pause and resume work
- [ ] /runs page shows counts moving; unauthenticated visit redirects to /login
- [ ] /health reports all checks; stopping MinIO flips to degraded
- [ ] pnpm test and pnpm type-check pass

## Deferred
- (item, phase it belongs to, why deferred)

## Verified on the box
- proxy image passthrough: unknown
- proxy concurrency 8: unknown
- `subscription` alias maps to: unknown
- BullMQ job.changePriority available: unknown
