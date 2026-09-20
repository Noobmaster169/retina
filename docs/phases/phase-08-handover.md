# Phase 8 handover: what phase 7 built, and what it left you

Two sessions wrote this file. Sections 1 to 4 are the design session's, written 2026-09-20
alongside `phase-07-handover.md` and unchanged. Sections 5 onward are phase 7's implementation
session, written after it merged, and they are the ones that will save you a day.

Read in this order:

1. This file, all of it.
2. `docs/phases/phase-07-handover.md`, for the canvas and why the design is what it is. It is still
   accurate about intent; it is out of date about the API, which phase 7 extended.
3. `docs/05-design.md` sections 4 to 9. Corrected in phase 7 wherever the build had to depart.
4. `docs/04-phases.md` phase 8, and `docs/03-infra-deep.md` sections 5.5, 8 and 10.

---

## 1. Do not build a second review component set

The case pane is phase 7's email page in its `NEEDS_REVIEW` state, drawn on the
`EmailReview.dc.html` board and built at `frontend/components/email/case-tab.tsx`. Phase 8 filters
the list to open cases, adds the action bar's handlers, and adds the routes behind them. The exit
checklist asks for a diff showing no duplicate component.

## 2. Every action writes a labelled example row

Phase 11's drafting job reads those rows to propose lessons. The mapping is fixed: `correct_field`
teaches `extract`, `reclassify` teaches `classify`, and a `note` teaches whichever step the case
reason maps to. Getting the action kinds and their fields right here is most of phase 11.

## 3. The chat's proposed action card is not yours to wire

It describes this phase's write path, but nothing routes a chat turn into a `review_action` and no
contract for it exists. Ship every action from the action bar; raise the contract with the user
before phase 10 builds it.

## 4. The product never arbitrates

A correction records what a person says a value is. It never marks one document right. There is no
correct value field anywhere in the UI and no button that writes to one side. `docs/05-design.md`
section 2.2 and section 11.

---

## 5. What phase 7 actually built

Phase 7 is merged. Nothing below is a plan; it is all in `main` and you should read it before
writing anything that touches it.

**The design system.** `frontend/app/globals.css` is the Air token set of `05-design.md` section 4,
with the type scale of 5.1 in the Tailwind theme. Newsreader, Inter and JetBrains Mono load through
`next/font`. No file in `frontend/` declares a colour outside these tokens, uses a Tailwind default
type size, or sets an uppercase label. Keep it that way: it was swept clean twice and both sweeps
found real drift.

**Primitives**, `frontend/components/ui/`:

| File | What it is |
|---|---|
| `icons.tsx` | The canvas's own glyphs, lifted path for path, plus `Mark` and `SeamGlyph`. lucide-react is installed for anything the canvas never drew |
| `chip.tsx` | `Chip`, `EnumChip`, `Label`, `Fact`, and `toneOf`, which maps an organiser enum to its hue. **No chip has a dot and none may gain one** |
| `panel.tsx` | `Panel`, `PanelHead`, `PanelFoot`, `Bar`. Every bordered rectangle in the product |
| `marked-span.tsx` | The five marking states, `Hatch` and `EvidenceWell` |
| `button.tsx`, `tabs.tsx`, `tooltip.tsx` | Radix behaviour, our surface |

**The shell**, `frontend/components/shell/`. Read `app-shell.tsx` first; it is the smallest file
and it decides the most.

**The screens**: `components/run/` (the run page's panels), `components/email/` (the email page's),
and the routes under `frontend/app/runs/`.

## 6. The shell contract, which is the thing to not break

This was got wrong twice before it was got right, and both times the symptom was the same: moving
around felt like changing product.

- **`AppShell` owns everything the rail shows.** It fetches the run list and the health itself. A
  page passes `active` (which destination is current), `counts`, and `runId`. It passes nothing
  about the rail's contents and nothing about its width.
- **The run is the context, not a page.** Every destination is `/runs/{id}/...`. The rail's head is
  a switcher; picking another run keeps you on the same destination, which is how two prompt
  versions get compared on one screen. Without any run, every destination leads to `/runs`.
- **The rail's width is the person's alone.** An earlier version let a pane ask for it
  (`wantsWidth`), so switching to `Both documents` closed the rail and hid the email list. That
  prop is gone. If a view needs width, take it from inside the pane or drop something at a media
  query, as the chat column now does below 1280.
- **Adding a destination** is one entry in `components/shell/nav.ts` and one page under
  `app/runs/[id]/`. Do not add a second nav pattern, a second shell, or a page outside it.
- **A destination you have not built is a `Placeholder`**, not a 404 and not an error page. Phase 8
  turns `app/runs/[id]/review/page.tsx` from one of those into the real queue.

## 7. Contracts phase 7 added

Each is a zod schema in `backend/src/contracts*.ts`, mirrored by hand in `frontend/lib/api/`, and
recorded in `03-infra-deep.md`. Change all three or none.

| Contract | Why it exists |
|---|---|
| `GET /runs/:id/queues` (`contracts.queues.ts`) | The slots, who is next, `heldUntil`, and `handoff`. The run page draws it |
| `DocumentView.pageConfidence` (migration `007`) | Per page OCR confidence. The review case has to say which page failed |
| `DocumentView.bytes` | The file size on the message card. It was already joined and simply dropped |
| `lastSubmission.scores.weights` | The scorer's own weights, so the score panel does not assume them |
| `DELETE /runs/:id` | Drops a run and everything it produced. Refuses a running run |

**Instants, never durations.** `heldUntil`, `startedAt` and `queuedAt` are all ISO instants because
the page counts against its own clock between polls. A duration is already two seconds stale by the
time it is drawn. If you add anything the UI ticks, make it an instant.

## 8. Design decisions settled in phase 7, with the user

Do not reopen these without asking; each cost a round of review.

- **Both documents take the mark** on a differing field. `components/email/field-reading.ts` holds
  the one `markOf` every screen uses.
- **Green stays** on a value the judge called the same across different text.
- **Nothing loops decoratively.** The one loop is the indeterminate sweep (`.sweep` in
  `globals.css`) on a stage with no denominator: slot occupancy, a model call in flight. Anything
  with a denominator keeps a determinate bar. Both bars stay mounted and cross-fade, because a CSS
  animation restarts whenever its element is created.
- **A run is named by when it started** (`components/shell/run-name.ts`), because the contract has
  no name field. One function, used by the header, the switcher and the list.
- **"Paused", never "rate limited".** See section 10.

## 9. What phase 8 builds, and where each piece plugs in

- `review_actions` migration, `POST /review/:id/actions`, `POST /review/:id/upload`, `GET /review`,
  per `03-infra-deep.md` section 5.5. Human values win: extract and compare read
  `human_value ?? value`.
- **The queue** replaces `app/runs/[id]/review/page.tsx`. It is `EmailList` filtered to open cases
  and grouped by `review_reason`, in the same shell. Failures are their own group.
- **The action bar** already exists, drawn and disabled, at
  `app/runs/[id]/emails/[emailId]/action-bar.tsx`. Phase 8 adds handlers, not a layout.
  `app/runs/[id]/use-run-actions.ts` is the pattern to copy: one hook holding the fetches, the
  pending state and the refusals, so two panels can offer the same action without either owning it.
- **`Correct field` edits inline on the comparison row**, so the quote stays visible while the
  value is typed. Never a modal.
- **`/files/*key`** streaming from MinIO. Phase 7 deleted the phase 1 `/attachments/[name]` proxy
  rather than leave it dead; phase 8 needs the real one for uploads and for the original documents.

## 10. Traps

Things that cost this session time. None of them is obvious from the code.

- **"Rate limited" is BullMQ's word and it is misleading.** Nothing throttles throughput.
  `queues/failure-policy.ts` catches a `DependencyUnavailableError` and calls `queue.rateLimit(30s)`,
  which means "start nothing new for thirty seconds"; the job goes back with its attempts
  untouched. It is a circuit breaker. Every string in the UI says "paused".
- **A CSS animation restarts from frame one every time its element is mounted.** Toggling a loader
  in and out of the tree leaves it frozen at its first frame.
- **The Browser pane freezes `requestAnimationFrame` and the document timeline when it is hidden.**
  An animation will read as `playState: running` with `currentTime: 0` forever. Screenshots also
  come back as stale frames. Measure the DOM instead of trusting a screenshot, and front the pane
  before judging motion.
- **A grid item wider than its track needs `w-max`**, or it overflows the panel instead of
  overflowing its column. This put the last card of the lane map off screen twice.
- **`status` on a run is the ingest's, not the pipeline's.** A run reads `completed` the moment the
  last email is enqueued, with every queue still full. `processingDone` is the field that means
  what a reader expects. The API refuses pause and cancel on a `completed` run for the same reason,
  which is why the run page offers neither once ingest finishes.
- **`next typegen` after moving a route**, or `tsc` fails on `.next/types/validator.ts` about a page
  that no longer exists.
- **The organisers' dataset carries no timestamps at all.** The canvas draws times on list rows and
  a date on the message header; those are the designer's invention. Do not add them.

## 11. Open, and deliberately not built

- **Rendered page images** for an unreadable case. Per page OCR confidence is real and shown; the
  page itself is a hatched block. Needs `docExtract.render` and `/files/*key`, which phase 8 brings
  anyway. `04-phases.md` marks this `[~]`, not done.
- **A `missing_value` case seen on screen.** Held by a unit test and by the component; no email in
  any local run produced one. If phase 8 produces one, tick it.
- **The memory panel** on a finished run. `core.lessons` is phase 11 and must not be stubbed. A
  `What it took` panel holds that rectangle meanwhile.
- **Views**, the ontology `Links to`, and the chat's turns. Phases 10a and 10b.

## 12. A finding for phase 9, not for you

BullMQ runs `CLASSIFY_CONCURRENCY` (8) plus `COMPARE_CONCURRENCY` (4) jobs at once, and all twelve
contend for the eight model slots `llmSlots(LLM_MAX_CONCURRENCY)` hands out, because
`LLM_MAX_CONCURRENCY` defaults to `CLASSIFY_CONCURRENCY` alone rather than the sum. Eight classify
jobs can hold every slot while four compare jobs sit blocked in the semaphore, which is exactly
what the run page keeps showing: sorting unaffected, checking paused. Either budget both
concurrencies against one number, or make `LLM_MAX_CONCURRENCY` their sum and raise
`proxy.yaml`'s `max_concurrency` with it. Do not fix it inside a UI phase.

## 13. Running it

```bash
docker compose -f compose.local.yaml up -d   # inside backend/
pnpm db:migrate && pnpm dev                  # api on :8091
pnpm dev:worker                              # in another shell
pnpm dev                                     # inside frontend/, :3000
```

`pnpm test` in `backend/` (444) and in `frontend/` (40). `pnpm lint` in `frontend/` enforces the
200 line rule, and tests are exempt from it. A phase 7 screen is reviewed by looking at it: start a
run at `ratePerSecond: 0` with `limit: 40` and watch the run page, then open a `MISMATCH` email.
