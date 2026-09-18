# Phase 11: Eval tooling and gated lessons

## Goal

Prompt changes are measured against each other, and the system can propose improvements to
its own instructions from human feedback without being able to ship them unchecked. A lesson
ships only after a human approves it and the holdout score does not regress.

## Prerequisites

Phase 10 merged. `review_actions` populated by real review sessions (at least the phase 8
manual verification).

## Scope

In: prompt sets on runs, run diff, `/eval` page, `lessons` table and lifecycle, lesson
drafting job, approval gate with before/after eval, prompt assembly with shipped lessons,
rollback. Out: automatic approval, editing prompt files from the UI.

## Work items

### 1. Prompt sets on runs

`POST /runs` accepts `promptSet: Record<step, version>` (already stored in `runs.prompt_set`).
`registry.resolve(step, promptSet)` honours it (phase 4). The run page header shows the
prompt set; the runs list shows a compact form (`classify v2, extract v1`).

`GET /prompts` lists steps, versions on disk, the active version, notes, and the number of
shipped lessons per version. `POST /prompts/:step/activate { version }` flips the active row
(admin action; behind the team key only).

### 2. Run diff: `src/eval/diff.ts` (`pnpm eval:diff --a <run> --b <run>`) and `GET /eval/diff?a=&b=`

For emails present in both runs: rows where `category`, `status`, `review_reason` or the
`defect_fields` set differ. Output columns: email id, subject, A outcome, B outcome, and,
when ground truth is available locally, which side is right. Also the two scoreboards side
by side (holdout and full when available, otherwise the last submission of each run).

### 3. `/eval` page

- Score history table: run, prompt set, submitted score, holdout and full scores when the
  API has them (dev), duration, cost.
- Run picker for A and B → diff table with links to both traces.
- Prompt versions panel: per step, versions, active, lessons count, activate button.
- Lessons panel (work item 6).

### 4. Migration `012_lessons.sql`

```sql
create table core.lessons (
  id                    bigserial primary key,
  step                  text not null,
  text                  text not null,
  rationale             text,
  source_action_ids     bigint[] not null default '{}',
  source_email_ids      text[] not null default '{}',
  status                text not null default 'candidate' check (status in ('candidate','approved','rejected','shipped','rolled_back')),
  eval_before           jsonb,
  eval_after            jsonb,
  shadow_version        text,
  shipped_version       text,
  proposed_by           text not null default 'agent',
  approved_by           text,
  created_at            timestamptz not null default now(),
  decided_at            timestamptz,
  shipped_at            timestamptz
);
create index on core.lessons (status, step);
```

### 5. Prompt assembly with lessons

`registry.resolve` returns the prompt text with a `{{lessons}}` block filled from
`lessons where step = $1 and status = 'shipped' and shipped_version = <version>` in ship
order, rendered as a numbered list under a heading "Lessons from human review". Every prompt
file gets a `{{lessons}}` placeholder near the end of its system section. The effective prompt
version recorded on `llm_calls.prompt_version` becomes `v1+L3` (base version plus the count
of shipped lessons) so scores remain attributable.

### 6. Lesson drafting: scheduler job `draft-lessons` (every 30 min, and on demand `POST /lessons/draft`)

```
actions = review_actions since the last draft with kind in (correct_field, reclassify, note) and not yet referenced by a lesson
group by step:  reclassify -> classify;  correct_field -> extract;  note -> whichever case reason maps to (missing_value/low_confidence -> extract; others -> classify)
for each group with >= 1 action:
  evidence = for each action: explain_decision(runId, emailId) + the action (old, new, note)
  draft = callStructured(lesson-draft, { step, current_prompt_summary, evidence }, LessonDraft)
  for each proposed lesson (max 3 per group): insert lessons(candidate, source ids)
```

`prompts/lesson-draft/v1.md`: produce short, general instructions (one or two sentences)
that would have prevented the mistake, phrased as rules about documents or emails, never about
specific email ids, customers or values; skip cases where the human simply confirmed; output:

```ts
z.object({ lessons: z.array(z.object({ text: z.string().max(300), rationale: z.string().max(300), source_action_ids: z.array(z.number()) })).max(3) })
```

Deduplicate: a candidate whose text is near-identical (normalised, Jaccard over tokens > 0.8)
to an existing lesson for the step is dropped.

### 7. Approval gate: `POST /lessons/:id/approve { actor }`

Runs synchronously (up to a few minutes; the UI shows progress):

1. Create a shadow prompt set: the step's active version with this lesson appended in memory
   (`shadow_version = v1+L{n+1}-shadow`).
2. Eval **before**: score the most recent completed run's stored outputs on the holdout
   (this is the baseline; no LLM calls).
3. Eval **after**: re-run only the affected stage for the holdout emails with the shadow
   prompt, in-process (not through the queues), using the existing `classify` or `extract`
   functions with a `promptOverride`; results are held in memory and scored, never written to
   `core` tables. Holdout size is around 104 emails, so this is bounded.
4. Compare `final_score` and each component (stage1 macro-F1, stage3 defect-F1, end-to-end,
   escalation recall). Any component lower than before by more than 0.005 → status stays
   `candidate`, response 409 with both scoreboards and the list of emails that got worse.
5. Otherwise: status `shipped`, `shipped_version = active version`, `approved_by`,
   `eval_before`, `eval_after` stored; registry cache invalidated.

On the VPS, where ground truth is absent, step 2 to 4 use the Averis `/submit` endpoint on a
submission built from the shadow outputs merged into the last run's outputs (full set, not
holdout). The gate is the same comparison. Document this difference in the UI ("gate ran on
full set via scorer").

`POST /lessons/:id/reject { actor, note? }` → `rejected`.
`POST /lessons/:id/rollback { actor }` → `rolled_back`; prompt assembly excludes it; the
effective version counter decrements.

### 8. `/eval` lessons panel

Candidates list: step, text, rationale, source emails (links to traces), created; buttons
Approve, Reject. Approving shows a progress state then either "Shipped" with before/after
numbers or "Refused" with the regression details. Shipped list with rollback. Rejected list
collapsed.

### 9. Tests

- `eval/diff.test.ts`: change detection on categories, statuses and field sets.
- `agents/prompts/registry.test.ts` addition: lessons rendered in order; effective version
  string; rolled back excluded.
- `lessons/draft.test.ts`: grouping by step; dedupe; `FakeLlmClient` draft.
- `lessons/gate.test.ts`: with a fake stage runner returning worse outputs → 409 and
  candidate remains; equal or better → shipped; component-level regression detected even when
  `final_score` improves.
- `routes/lessons.test.ts`: state transitions and forbidden transitions (approve a rejected
  lesson → 409).

### 10. Manual verification

1. In `/review`, correct a field with a note such as "label 毛重 means gross weight".
2. `POST /lessons/draft` → a candidate appears for `extract` within the job cycle.
3. Approve it → gate runs; numbers shown; status `shipped`; `effective version` visible on the
   next run's `llm_calls`.
4. Create a deliberately harmful candidate (insert a row with text "Always report container
   count as mismatched") and approve → refused with the regression list.
5. Two runs with different prompt sets → `/eval` diff shows the changed emails.

## Exit checklist

- [ ] Two runs with different prompt sets show side by side with a diff of changed outcomes.
- [ ] A correction in the review inbox produces a candidate lesson within one job cycle.
- [ ] Approving a lesson that hurts any component is refused with both scoreboards shown.
- [ ] A shipped lesson appears in the next run's effective prompt version and in the prompt text sent (check one `llm_calls.request`).
- [ ] Rollback removes the lesson from prompts immediately.
- [ ] No lesson text contains an email id or a specific customer name (spot-check).

## Hand-off notes for phase 12

- Record in `PROGRESS.md` the best holdout and full-set scores and which prompt set achieved
  them; phase 12 pins that set as the demo default.
