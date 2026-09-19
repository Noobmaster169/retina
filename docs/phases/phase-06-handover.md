# Phase 6 handover: what phase 5 changed under you

Written 2026-09-20 at the end of phase 5 on `phase-05-parsing-and-triage`. Read this before
`phase-06-extraction-and-comparison.md`: that spec was written before phases 4 and 5 and
several of its items land on code that has moved. Where the two disagree, this file describes
what is built. The detail is in `docs/PROGRESS.md` (Phase 5, Design decisions (phase 5), Found
while building) and `docs/03-infra-deep.md` sections 5.3, 5.4, 6 and 8.1.

## 0. Before you start

- Branch phase 6 from `main` once the phase 5 PR is in, not from the phase 5 branch.
- The user's to run, not yours: the holdout run that decides whether classify `v5` (the
  attachments' text as context) becomes active, `pnpm eval:score --holdout` on a run with the
  edge cases, and the box check after the deploy that brings the doc-extract container up. Leave
  them in PROGRESS as they are.
- Keep your own runs at 20 to 30 emails. The twenty edge cases are not in the dev sample
  (`subset: "dev"` is stratified from train by category and they are all `BL_COMPARISON`); a
  phase 6 check is a run of explicit `emailIds`. `email_504`, `506`, `512` and `519` are holdout
  ids: do not tune on them.

## 1. Where phase 6 plugs in

`queues/processors/compare.processor.ts`, `compareOnce`. After `checkStructure` answers
`compare` (an SI and a BL, both readable, neither typed as another kind of document), the
processor today writes `{ placeholder: true, si, bl, extras }` as `OK`. That branch is yours:
extract, evidence check, verify on doubt, judge, assemble, decide. Everything before it stays.

What you have in hand at that point, per document (`ParsedDocument` from `parse-documents.ts`):
the `documents` row (id, role the filename claims, the model's `docType`, confidence and
rationale, format, pages, `scanned`, `unreadable`, warnings) and `text`, the full extracted text
already read back from MinIO. Do not re-parse and do not call doc-extract again; `parseDocuments`
is idempotent and has run. The text object key is `keys.text(runId, emailId, filename)`.

`checkStructure` returns `si` and `bl` as filenames after `resolveRoles`: the filename's claim
first, the model's word for a file that claimed nothing, a crossed pair swapped. Use those names
to pick the two documents, not the `role` column.

## 2. The scanned case carries `provisional: null` for you

A pair read by OCR is escalated as `unreadable` with `scanned: true`, its page image keys under
`pages`, and `provisional: null` (`pipeline/compare/structure.ts`). The spec's policy is that a
scan is never silently trusted; phase 6 fills `provisional` with the comparison run on the OCR
text so the reviewer sees a suggested result. The OCR text is in the store like any other, and
`documents.scanned` says which documents came that way. Do it after the readable path works.

## 3. `missing_value` is the fourth reason, and it is yours

`review_cases.reason` and `comparisons.review_reason` already accept it. `escalate()` in
`queues/processors/escalate.ts` takes any of the four; call it from the compare branch with the
missing fields in `detail`. Precedence when several apply is fixed in 5.3 of the infra doc:
`unreadable` > `wrong_doc_type` > `missing_attachment` > `missing_value`; the first three are
decided before your branch runs, so only `missing_value` is yours to raise.

## 4. New model steps go through the same machinery

Phase 4's handover section 3 still applies, and phase 5 walked it: for each of `extract`,
`extract-verify` and `field-judge` (the spec's names), add the step to `PromptStep` and
`PromptSet` in `contracts.ts` and `frontend/lib/api/runs-schemas.ts`; a prompt file under
`agents/prompts/<step>/v1.md`; an entry in `ENV_MODELS` in `agents/prompts/prompt-set.ts` and the
matching `LLM_MODEL_*` in `config.ts` and `.env.example` (run-plan checks every step's override
now, from `PromptStep.options`); an active row in your migration (`006`); the `shipped` list in
`test/agents/registry.test.ts`; `frontend/app/runs/[id]/step-label.ts`; and a line in `STEPS` in
`frontend/app/runs/new-run-form.tsx`, which makes the dropdown. `promptSetOf` in
`queues/processors/prompt-set-of.ts` fills the pins of a run created before your step existed.

Every call goes through `callStructured` with `deps.live`, so it streams to the run page and
lands in `llm_calls`. `llmCalls.latestAccepted(emailRunId, step, promptVersion)` returns an
answer already paid for on an earlier attempt; the doc-type step instead keeps its verdict on
the `documents` row, because there are two calls per email under one step. An extraction is one
call per document too, so key its reuse the same way: on the `extractions` row, not the ledger.

## 5. Errors and outages, unchanged

The compare worker is wrapped in `pausingOnOutage`: a `DependencyUnavailableError` (the proxy
or doc-extract down) pauses the queue and puts the job back with its attempts untouched. A
`TerminalError` fails the email. A step whose output never fits its schema is a `TerminalError`
after two attempts; decide per step whether to fail the email or degrade, as doc-type degrades
(a document it could not type keeps a null `docType` and its filename's claim stands).

## 6. The run page and the trace

`GET /runs/:id/emails/:emailId/trace` carries `documents` and `review`; the
`DocumentsPanel` shows them beside the verdict. Add your extractions and diffs to `EmailTrace`
in `contracts.trace.ts` (a sibling file if it grows past 200 lines), mirror them in
`frontend/lib/api/trace-schemas.ts`, and give them a panel. The run summary's `review.byReason`
already has a `missing_value` slot, and the email list's outcome filter lists it.

`/runs/[id]/results` is where the exit checklist becomes visible: the defect and defect-field
cells of the comparable emails should turn from red to right, and the `missing_value` five
(`email_516` to `520`, all train) should turn their review-reason cell.

## 7. Gotchas from phase 5

- Git Bash eats quotes and backslashes in an inline heredoc that carries Python with triple
  quotes: write the script to a file and run it (memory `windows-shell-quoting`).
- The doc-extract suite runs here with the OCR test skipped (no tesseract on Windows); the image
  runs all of it: see the command in PROGRESS or `docker run --rm -v "$(cygpath -m "$PWD")":/src:ro retina-doc-extract sh -c "cp -r /src /tmp/w && cd /tmp/w && uv sync --frozen -q && uv run pytest -q"` from `services/doc-extract`.
- `deploy/sim/sim.sh test <branch>` takes about five minutes and is the only gate on `deploy/`;
  it passed 23 of 23 at the end of phase 5.
- The doc-type model read the xlsx BL of `email_005` as an SI at 0.62; the filename's claim
  stood, so nothing was lost, but if you see it again on the full run it is a prompt sentence
  about flattened spreadsheets, never a title rule.
