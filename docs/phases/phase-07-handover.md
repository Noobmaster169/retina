# Phase 7 handover: build from the canvas, not from memory

Written 2026-09-20, after phase 6 merged and after four rounds of design review settled the
interface. Read this before `docs/04-phases.md` phase 7 and before
`docs/phases/phase-07-dashboard-and-trace.md`, per the session protocol in `CLAUDE.md`.

This is a handover from a design session to an implementation session. Nothing in `frontend/`
follows the new design yet. Your job in phase 7 is the design system, the shell, the run page and
the email page. Phase 8 is at the foot of this file.

---

## 1. Read the canvas first, and read all of it

Eleven artboards at 1440x900, reviewed and signed off by the user:

```
https://claude.ai/artifact/CSbrqYfTwzHpGFLVgKQpUZ
```

It is private to the user, so you reach it with the Artifact tool rather than a browser. Read the
index first, then every board:

```
Artifact  action: "read"  url: <above>  path: "project/canvas.json"
Artifact  action: "read"  url: <above>  path: "project/Main.dc.html"
```

`canvas.json` holds the board titles, their positions in four rows, and a sticky note per board
saying what that board decides. The notes are the shortest route into the design; read them before
the boards.

| Board | Row | What it settles |
|---|---|---|
| `Main.dc.html` | the run | Two queues left to right, one panel per queue, the outcomes list |
| `RunTrouble.dc.html` | the run | A dependency down, and how an empty panel should behave |
| `RunDone.dc.html` | the run | A finished run, the score, and what the run taught |
| `EmailCheck.dc.html` | one email | The message card, the seam, the reading, the seven fields, the chat |
| `EmailReview.dc.html` | one email | The same page with a case instead of a check |
| `DocsDiff.dc.html` | one email | Both documents, the rail closed, the marking states |
| `DbGrid.dc.html` | the database | As rows: the typed grid and the row drawer |
| `DbEntities.dc.html` | the database | As things: the entity list that opens in place |
| `DbRecord.dc.html` | the database | The record: appearances, spellings, where it sits |
| `ObjectTyped.dc.html` | the ontology | The Record tab |
| `GraphLinks.dc.html` | the ontology | The Links tab |

The boards are `.dc.html`: markup with inline styles, and a `renderVals()` block at the foot
holding the data. **Read the data block.** It is where the real enum values, the real counts and
the real sample text live, and it is the fastest way to see what a component is actually for.

Phase 7 builds rows one and two. Rows three and four are phase 10b, and you should still read them,
because the rail, the chips and the type scale are shared and you are setting those.

**The canvas is a picture, not a spec.** It is drawn at 1px precision in inline styles because that
is what the tool draws. Take the layout, the hierarchy, the copy and the component anatomy from it.
Take the tokens and the spacing scale from `docs/05-design.md` sections 4 to 6, which is the
corrected version. Where a board uses `#9CA3AF` for something that carries information, section 4.3
tells you to move it up to `#6B7280`; that is a real bug in the boards, not a style to copy.

---

## 2. Then investigate the codebase yourself

Do not take the numbers in this file on trust. Read, in this order:

**The contracts, which are what the pages render.** `backend/src/contracts.ts` and its siblings
`contracts.enums.ts`, `contracts.scoring.ts`, `contracts.review.ts`, `contracts.trace.ts`,
`contracts.extraction.ts`. Every enum the UI shows is defined there, value for value, and
`CLAUDE.md` forbids inventing one. Then `frontend/lib/api/` for the hand written zod mirrors, and
`frontend/lib/api-client.ts` for the barrel. A new field is a schema in `lib/api/`, not an
interface.

**What already exists in the frontend**, because phase 6 shipped more of it than the phase 7 spec
assumes: `frontend/app/runs/[id]/` (run-overview, run-emails, working-now, live-feed,
comparison-panel, documents-panel, verdict-panel, email-trace, call-card, results),
`frontend/app/runs/` (runs-table, run-row, score-cell, new-run-form),
`frontend/components/` (mail-shell, mail-list, email-view, chat-panel). Decide per component
whether the new design replaces it or re-skins it, and say which in your commit messages. The
200-line rule is enforced by eslint.

**The pipeline, because the run page draws it.** `backend/src/queues/names.ts` for the three
queues, `backend/src/config.ts` for `CLASSIFY_CONCURRENCY` and `COMPARE_CONCURRENCY`,
`backend/src/queues/processors/classify.processor.ts` for the one crossing between them, and
`backend/src/queues/failure-policy.ts` for what a held queue actually does. The run page is a
drawing of these four files and it will be wrong if you have not read them.

**The current state of play.** `docs/PROGRESS.md` says which phase is current, what phase 6 left
open, and what a run costs. `docs/03-infra-deep.md` sections 5, 8 and 13 give the routes, the
schema and the polling intervals.

**The design docs, now corrected**: `docs/05-design.md` (tokens, type, space, the shell, the
component index, the anti-patterns), `docs/design/screen-blueprints.md` sections 3, 5, 6 and 14,
`docs/design/ontology-patterns.md` for what was kept and what was cut.

---

## 3. What the review actually decided

Four iterations were rejected before this one. The notes below are what the rejections were about,
and they are worth more than any layout in the canvas because they will catch you on screens
nobody has drawn yet.

1. **No status dots.** A coloured dot beside a chip, a row or a card. It appeared everywhere in the
   third iteration and the user called it out by name as making the work look unfinished. The chip
   carries its state in its label and its tint. Applies to health chips, run status, outcomes,
   queue rows, everything.
2. **One column, one row per thing.** A two column grid of small boxes was rejected for the queue
   panels. Lists are lists.
3. **An empty panel gets replaced, not padded.** Four dashed placeholder slots standing in for four
   busy ones was rejected. Ask what the person needs from that rectangle at that moment. The
   trouble board and the finished board are the two worked examples, and they are different answers
   to the same rectangle.
4. **Abstraction over exposure.** No JSON on screen, no model names, no token counts, no dollar
   costs. These are all true and none of them is what a documentation clerk needs. An email is
   shown as an email.
5. **The flow is horizontal.** A vertical workflow canvas was drawn and rejected outright. Left to
   right, and it shows two queues rather than one pipeline, because that is what the code does.
6. **The seam.** The single most useful change: the message is a bordered card and a labelled rule
   under it says where Retina starts. The user could not tell where the sender stopped, and that
   was with a design that had no obvious problem.
7. **The type pairing is Newsreader over Inter over JetBrains Mono.** A warm paper ground in Geist
   was drawn as an alternative and dropped. One display line per page.
8. **Plain English first, the enum inside it.** "Five of the seven fields agree, two name different
   companies", then `BL_COMPARISON` in mono as a chip. Not the other way round.

---

## 4. What the API does not return yet

The canvas draws several things the backend cannot currently feed. Each is a decision, not a
blocker.

| What the board shows | What exists | What to do |
|---|---|---|
| One row per busy queue slot: which email, which step, how long it has held it | `RunSummary.queues` gives `waiting`, `active`, `failed` counts only | Build it. `GET /queues` is already in the phase 7 list; return the active jobs per queue with their `emailId`, step and `processedOn`. This is the most visible thing on the run page |
| The handoff count, `220 need a check`, and `not_comparable 300` at the seam | `stageCounts` and the `outcome` column | Aggregate in the route, not in the page. `CLAUDE.md`: no business logic in the frontend |
| The memory panel and the rail's memory block | `core.lessons` does not exist until phase 11 | Render the panel only when the table is there. Do not fake a lesson, and do not stub the table |
| The chat rail, its scope chips and its proposed action card | `agents/chat` is phase 10a; nothing routes a chat turn to a `review_action` | Draw the 340px column, fill it with the reading, disable the composer with one sentence saying why. Reserving the space is the point |
| `written these ways` on a port or a party | `ports`, `parties`, `shipments`, `carriers` are phase 10b and are drawn `planned` on purpose | Not phase 7. Do not build the tables |
| Per page OCR confidence on the review board | `DocumentView` carries `pages`, `scanned`, `unreadable`, `warnings` | Check whether the per page numbers survive into the trace. If they do not, either extend the contract or draw the document level number and say so |

Anything you add is a zod schema in `backend/src/contracts.ts`, mirrored by hand in
`frontend/lib/api/`, and mirrored again in `docs/03-infra-deep.md` in the same commit.

---

## 5. What phase 7 does not build

- The database page and the ontology pages. Phase 10b, and rows three and four of the canvas.
- Every write path: confirm, correct, reclassify, note, upload, retry. Phase 8.
- The chat itself. Phase 10a.
- Lessons, candidates and the approval gate. Phase 11.
- The Earth view. Phase 10c, optional, and not drawn.
- **The provenance spine, the 60px row strip, the histogram facets and the stage bar.** All four
  are in the original phase 7 spec and all four were cut in review.
  `docs/design/ontology-patterns.md` says why, and keeps them for the record.

---

## 6. Settle these with the user before you build them

1. **Marking both sides of a differing field.** `docs/05-design.md` section 4.5 states the conflict
   plainly: the original rule was that the SI column stays neutral so the design never implies
   which document is right, and the canvas marks both sides because a person comparing two
   documents should see both. Both are defensible. Pick one, write it into 4.5, and do not let two
   screens differ.
2. **Green on values that agree.** The canvas marks two fields green where the values differ
   textually but the judge called them the same (`NANTONG, CHINA` against
   `NANTONG, CHINA (CNNTG)`). It is genuinely informative and it also spends a verdict hue on a
   non verdict. Keep or drop, once.
3. **Row density.** The boards use 34 to 36px rows for lists and 86px for the mail list. The design
   language says density is the courtesy. Check a real 520 row table at that height before you
   commit to it.
4. **The collapsed rail.** `DocsDiff.dc.html` is the only board drawn with the rail closed, and no
   other collapsed state was designed. Decide what the list pane does at that width.

---

## 7. Definition of done, on top of the usual

`CLAUDE.md` section "Definition of done" applies unchanged. Add:

- The phase 7 exit checklist in `docs/04-phases.md`, which was rewritten against this design.
- A screenshot of the run page in its three states and the email page in its three tabs, in the PR.
  A design this specific is reviewed by looking at it.
- `docs/05-design.md` corrected in the same commit wherever you had to depart from it, per rule 5.

---

## Phase 8, when you get there

Phase 8 is small if phase 7 is right, and large if it is not.

**The case pane already exists.** It is the email page in its NEEDS_REVIEW state
(`EmailReview.dc.html`), built in phase 7. Phase 8 adds the queue in front of it and the write path
behind it, and builds no second component set. The exit checklist asks you to prove that with a
diff.

**What phase 8 adds:**

- `review_actions`, the three routes, and the rerun behaviour in `docs/03-infra-deep.md` section
  5.5. Human values win: extract and compare read `human_value ?? value`.
- The queue: the same shell with the list filtered to open cases, grouped by `review_reason`, with
  failures in their own group.
- The action bar, pinned above a hairline. `Correct field` edits inline on the comparison row so
  the quote stays visible while the value is typed. Never a modal.
- Failure cases from the BullMQ `failed` handler, with a retry.

**The one thing to raise before building:** the chat's proposed action card describes exactly this
phase's write path, and nothing connects them. A chat turn cannot currently produce a
`review_action`, and no contract in `03-infra-deep.md` says what it would be allowed to write, who
may apply it, or what `Apply and remember` means beyond `Just this once`. Phase 8 ships every
action from the action bar and leaves the card to phase 10. If phase 10 is going to build it,
specify it in `03-infra-deep.md` first.

**Why the write path matters beyond phase 8:** every action stores a labelled example row, and
phase 11's drafting job reads those rows to propose lessons. A `correct_field` becomes a lesson for
`extract`, a `reclassify` becomes one for `classify`, and a `note` becomes one for whichever step
the case reason maps to. That is the whole memory feature, and it starts here. Get the action kinds
and their fields right and phase 11 is mostly a job and a gate.
