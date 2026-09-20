# Progress

Current phase: 9, built on `phase-09-priority-and-ops`. **Phase 8 is merged to `main`.** Phase 7's
two `[~]` items are still under "Deferred" below.

**Start at `docs/phases/phase-10-handover.md`.** Phase 9's section is below; the shell contract and
the traps in `docs/phases/phase-08-handover.md` sections 6 and 10 all still apply.

Phase 6 is built and tested; left for the user there: the holdout run and the full 520 run that
decide its exit checklist's score lines (`pnpm eval:score --run <id> --holdout`), and phase 5's
open items (the box check of doc-extract, the classify `v5` holdout). Phase 4's open items (the
few-shot `v4` holdout, the model comparison) are still the user's.

## Phase 9

The queues behave like production queues: a client's tier decides who is served first, nothing
starves, the model cap covers every queue that contends for it, the clock lives in the worker, and
`/health` says enough that a person and a deploy script can both act on it.

**Built.**

- Migration `009_clients_seed.sql`: the nine domains the organisers' kit names as parties to a
  shipment, every one at the default tier. Additive and idempotent.
- `src/queues/priority.ts`, pure: `tier * 200 - min(floor(tonnage / 10), 99)`. The bonus caps below
  a tier's width so it can never cross one, and the result is never 0, which BullMQ reads as "no
  priority" and serves **ahead** of everything rather than behind it.
- `src/queues/priority-cache.ts`: the `client:priority` hash behind one interface with a memory
  fake. A read that fails answers null and the caller takes the default tier, because an email that
  arrives while Redis is restarting still has to be queued.
- `src/queues/aging.ts`: anything waiting over five minutes gains a tier of urgency, four passes
  bringing the least urgent email to the front. A person's rerun is not exempt: aging only
  promotes, so there is nothing to exempt it from.
- `src/queues/schedulers.ts`: a `scheduler` queue with three repeatable jobs (the cache refresh,
  the aging pass, the heartbeat), registered by key so the worker restarting every three minutes
  under auto-deploy re-registers three rather than accumulating a fourth. The first heartbeat and
  the first refresh happen at boot, before registration.
- `src/queues/heartbeat.ts`: `worker:heartbeat`, written every 10 s with a 60 s TTL. Six beats, not
  one: a worker that misses a cycle under load is still working.
- `src/health.ts` and `src/health-probes.ts`: every check is an object carrying its own latency and
  whatever that dependency says about itself, all of it free from the dependency's own health
  payload. `llmProxy` and `worker` are new. `down` and 503 only for postgres or redis.
- `GET /clients`, `PUT /clients/:domain`, and the `/clients` page with its rail entry and the
  write-through to the cache.
- `scripts/load-test.ts`: a burst, its elapsed time, its peak queue depth, the peak model calls in
  flight swept out of `llm_calls`, and any 429s.
- The logging audit: a model call names its `promptVersion`, a failed job names its `jobId` and
  `attempt`, a queue pause names the job that caused it, and `routes/request-log.ts` gives every
  request an id the response echoes. Successful requests log at `debug` on purpose: every open tab
  polls three routes, and at `info` that would bury every decision the worker makes.

**The finding phase 7 wrote down and phase 8 left alone.** `LLM_MAX_CONCURRENCY` defaulted to
`CLASSIFY_CONCURRENCY` (8) alone while BullMQ runs 8 classify plus 4 compare jobs, all contending
for those 8 slots, so eight classify jobs could hold every slot while four compare jobs sat blocked
in the semaphore. It is their sum now, and `proxy.yaml` serves 12 to match. Both sit well under the
measured ceilings: `claudecli` about 0.5 requests a second, ngrok falling over above roughly 64
sockets.

**New contracts**, mirrored in `frontend/lib/api/` and in `03-infra-deep.md` sections 4 and 10:

- `contracts.clients.ts`: `ClientRow` (with `known`, false for a sender nobody has ranked),
  `ClientList`, `ClientUpdate`, and `DEFAULT_TIER`.
- `HealthReport` is a different shape: `status` gains `down`, every check is an object, and the
  report carries `version` and `queues`.

**Four things in the phase 9 spec were wrong; `phase-09-priority-and-ops.md` is corrected.**

- The migration number. Phase 8 took `008`; `db/migrate.mjs` applies by filename, so a duplicate is
  a migration that silently never runs.
- `expire-counters` expires `run:{id}:counters`, a key that was never built: phase 7 draws its
  counters from Postgres and `live:call:*` carries its own TTL. Not built, and `03-infra-deep.md`
  section 4.1 is corrected.
- The health check named `averis`. The built check is `inbox`, and the rail, its labels and
  `DEPENDENCIES` all read that name. `CLAUDE.md` rule 5 gives the repo the last word.
- "Insert every sender domain seen in the dataset", against its own list of nine. Fifteen appear;
  the other six are the phishing senders, and seeding those would be a sender list fitted to one
  seed of one dataset. `GET /clients` lists every sender actually seen instead, so all fifteen are
  on the page with the six marked as nobody's decision.

A fifth, smaller: the spec's test table says tier 1 and 500 MT is 151. It is 150.

**Traps this phase added.**

- **`changePriority` updates `job.priority` and leaves `job.opts.priority` alone.** The options
  hold what the job was added with, so an aging pass that read them recomputed the same first step
  forever: a job went 1000 to 900 and stayed there however long it waited.
- **Two untyped parameters inside one `coalesce` are both inferred as text**, which Postgres then
  refuses to write into a smallint. The upsert casts every parameter.
- **Changing the health shape reaches the deploy scripts.** `retina_health_ready` in
  `deploy/lib/stack.sh` gated on the substring `"postgres":"up"`, which a nested check does not
  contain: left alone it would have failed every deploy's health check and rolled back a working
  image. It accepts both shapes now, because a rollback puts the older image back and has to pass
  its own gate. `deploy/sim/sim.sh` asserted the same substrings and is updated with it.
- **A dev box accumulates workers.** Four generations of `pnpm dev:worker` from earlier sessions
  were all consuming the same Redis queues, one of them pointed at a doc-extract base URL ending
  `/nope`. A burst run came back 36 failed out of 52 with `doc-extract returned 404`, which is not
  a bug in anything in this repository. Before reading a run, check there is one worker.
- **A test against the real `scheduler` queue wipes a running worker's registrations.**
  `startSchedulers` takes a queue name so the test has its own.

**Settled while building.**

- **A rerun takes the priority the email already has**, read back from `email_runs.priority` rather
  than recomputed. A correction on a tier-1 client's email queueing behind a burst is the one thing
  the person who just fixed it would never expect.
- **Aging does not exempt a rerun.** The phase 8 handover worried one would "age out"; that reads
  the sign backwards. BullMQ serves the lowest number first, so aging promotes.
- **`/clients` is global, not run-scoped.** Every other destination is `/runs/{id}/...` and the
  shell contract forbids a second nav pattern, but a tier is a standing decision about a sender and
  not a property of one replay. `Destination.global` is the one field that allows it.
- **`kind = 'spam'` is a label and nothing reads it.** It is offered on the page because a person
  may want to say it. No category is decided by it, by a sender list, or by anything but the model.

## Phase 8

The human in the loop path is real. A reviewer sees every escalated case with its evidence,
confirms or corrects it, uploads a document, reclassifies it, leaves a note, or retries a job that
failed, and every one of those is stored as a labelled example for phase 11.

**Built.**

- Migration `008_review_actions.sql`: `core.review_actions` (append only, the seven kinds as a
  check constraint and the organisers' seven fields as another), `attachments.review_case_id`,
  `email_runs.rerun_count`, and `comparisons.decided_by`. All additive, every added column with a
  default, so a rollback to phase 7 reads none of them.
- `src/review/`: `actions.ts` holds the transaction, the state guards and the answer; `effects.ts`
  is one function per kind; `upload.ts` sniffs the bytes and stores the file; `rerun.ts` spends the
  rerun count and enqueues. The api's `GET /review`, `GET /review/stats`, `GET /review/:id`,
  `POST /review/:id/actions` and `POST /review/:id/upload`, plus `GET /files/*key`.
- Failure cases. `queues/record-failure.ts` is what a failed job leaves behind: an attempt counted
  while one remains, and on the last one a failed email and a case with `kind = failure` and no
  review reason. It is its own module rather than a closure in `workers.ts` so it can be tested
  without Redis.
- `/runs/[id]/review`: the queue at 300px, case rows at 46px grouped under the reason that raised
  them with the failures in their own group at the foot, and the case pane beside it. Which case is
  open lives in the URL, so one can be handed to someone.
- **One case component set.** `components/email/email-pane.tsx` is the email page's middle column,
  lifted out of `app/runs/[id]/emails/[emailId]/` so the review queue opens the same pane. The
  email page is now the shell, the list and that pane; `git diff` shows no second review component.
- The action bar is live, in the order of `03-infra-deep.md` section 5.5. What a control needs
  beyond a click (a note, a category, a file, the reviewer's name) opens as a strip above the bar,
  never over the case.
- `Correct a field` edits inline on the comparison row, both sides offered, the quote still on
  screen. There is no correct-value field anywhere and no button that writes to one side as right.
- Every write raises a toast carrying the api's own sentence and, where a rerun was queued, what it
  set off. `ToastHost` lives in `AppShell`, which is the one component on every screen.

**New contracts**, each mirrored in `frontend/lib/api/` and in `03-infra-deep.md` sections 5.5, 8
and 10:

- `contracts.actions.ts`: the action kinds, the per-kind body as a zod discriminated union, the
  queue's row, the stats, and what an action answers with.
- `ReviewCaseView` gains `id`, `kind`, a nullable `reason`, `resolvedAt`, `resolvedBy` and its
  `actions`. The case pane writes without asking a second question first.
- `DocumentView.origin`, so the case pane can say which file a person supplied.
- `ClassificationView.humanCategory`. Every screen reads `humanCategory ?? finalCategory`, as the
  submission builder already did.
- `RunQueues.rerun`, the one seam a person's correction needs into the queues, with the memory fake
  recording what would have been added.

**Three real bugs this phase found, none of them in its own new code.**

- **A corrected value kept the model's quote.** `withHumanValues` replaced the value and left
  `source_quote`, so the judge was shown `235,550 KG` quoted from a line reading
  `Gross Weight(KGS): N/A` and called it a placeholder. The correction re-ran and the case came
  straight back with the same reason. A human value now replaces the quote, the placeholder and the
  confidence together, and `extractions.human-values.test.ts` holds it.
- **`pageConfidence` is 0 to 100, not 0 to 1.** doc-extract reports tesseract's own scale and phase
  7's contract comment said 0 to 1, so the case pane drew a scan at 86.9 as `8695%`. The contract
  now states the scale and the three screens that divided by it are corrected.
- **`UPDATE ... RETURNING` gives the new row.** Both `setHumanValue` and `setHumanCategory` read
  what stood before in a CTE now. Without it every action row said the old value was the new one,
  which is the one thing phase 11 needs from them.

**Settled while building, and worth not reopening.**

- The queue is the blueprint's case row (46px, the email id, the subject, the reason chip, the age)
  and not the 86px mail row. `phase-08-handover.md` section 9 calls it "`EmailList` filtered";
  `design/screen-blueprints.md` section 7, which `04-phases.md` cites, is more specific and it
  wins. A case is not a message: the reason and the age are what a person chooses on, and the
  sender's initials are not.
- A failure case is red, not violet. Section 4.4 keeps violet for uncertainty handed to a person
  and red for a job that failed, and never lets the two share a badge.
- The stack of a failed job is stored on the case and is not drawn. What a person can act on is the
  stage, the attempts and the message; a stack trace on screen is exposure, not information.
- The reviewer's name is asked at the first write, not on arrival, and it is read through
  `useSyncExternalStore` rather than into state in an effect: the browser owns it, two panes open at
  once see the same name, and eslint's `set-state-in-effect` rule is right about why.

**Checked against the canvas**, at 1440x900 in a browser, on run `09bbd120` (12 edge-case emails,
10 open cases): the queue, a `missing_value` case corrected inline, an `unreadable` case, a
`missing_attachment` case, and a failure case with its retry. The case pane matches
`EmailReview.dc.html` panel for panel; the action bar matches it button for button, with
`Correct a field` added where there are fields to correct.

**Exit checklist**, all checked live on runs `09bbd120` and `3acde761`:

- [x] Correcting the blank weight on `email_516` re-ran compare and the case closed: status `OK`,
      `resolved_by = Kai`, `gross_weight_kg` same on both sides.
- [x] Uploading an SI and a BL to `email_508` (`missing_attachment`, nothing attached) produced a
      full comparison: `MISMATCH` on consignee and notify_party, case resolved, both documents
      `origin = human`.
- [x] A permanent doc-extract failure created a failure case within seconds
      (`kind = failure`, no reason, stage `compare`); retry after the service was reachable again
      ended the email `done` / `OK` and closed the case. Note the spec's wording: *stopping*
      doc-extract does not do this, it pauses the queue, which is `failure-policy.ts` working as
      phase 5 built it.
- [x] The submission after review reflects the human decisions: `email_516` `OK`, `email_508`
      `MISMATCH` with its fields, `email_501` still `NEEDS_REVIEW` / `wrong_doc_type` after a
      confirm. `decided_by` stays `llm` because the organisers' enum has only `rule` and `llm`; ours
      is `comparisons.decided_by`, which the submission never carries.
- [x] Every action is in `review_actions` with its actor and its old and new values.
- [x] A second escalation on the same email updates the open case in place; the unique index and
      `review-cases.repo.test.ts` both hold it.
- [x] The case pane is phase 7's component with a different tab selected. `git diff` shows
      `case-tab.tsx` split and extended, and no second review component set.
- [x] A correction never writes a correct value: both sides are offered, `human_value` is stored per
      document, and the pair is judged again from both.
- [x] Every action raises a toast naming what was written and what was re-queued.

**Tests.** 491 in `backend/` (44 new: the action semantics, the reruns that resolve and re-escalate,
the failure cases, the review and files routes, triage's preference for a human upload, and the
human-value substitution), 40 in `frontend/`. Type-check clean in both, `pnpm lint` clean.

**Deferred.**

- The chat's proposed action card. It describes exactly this write path and nothing routes a chat
  turn into a `review_action`; the contract for that still does not exist. Raise it before phase 10
  builds the chat, as `phase-08-handover.md` section 3 says.
- Rendered page images for an unreadable case. `/files/*key` now exists and `docExtract.render`
  already writes the PNGs, so this is a `<img>` and a key away; the page is still a hatched block.
  Still `[~]` in `04-phases.md`.
- **The action bar on an email that was never escalated.** `EmailCheck.dc.html` draws it live on a
  MISMATCH, and every write path in this phase is addressed by a case id: `review_cases` exist only
  for escalations, so a MISMATCH that needs nobody has nothing to write to. The same gap as the
  chat's action card, and the same answer: the contract has to say what an action against an email
  run rather than a case would be, before a screen offers one. The bar is present and disabled on
  those emails, with one sentence saying why.
- `GET /review/stats` is built, tested and not yet drawn. The queue's own group counts say enough
  for one run; the numbers it adds (resolved today, median time to resolve) belong on a screen
  about the queue rather than in it.

## Phase 7

The interface was designed on 2026-09-20 over four rounds of review, on a canvas of eleven
artboards at `https://claude.ai/artifact/CSbrqYfTwzHpGFLVgKQpUZ`; `docs/phases/phase-07-handover.md`
says how to read it. Phase 7 built rows one and two of that canvas.

**Built.**

- `frontend/app/globals.css` is the Air token set of `05-design.md` section 4, with the type scale
  of 5.1 in the Tailwind theme. Newsreader, Inter and JetBrains Mono load through `next/font`. The
  phase 1 harbour palette is gone from every file, including the pages phase 7 only re-skinned
  (`/runs`, `/`, `/chat`, `/login`, `/runs/[id]/results`).
- The shell: `components/shell/` is a 232px rail that collapses to 56px of glyphs, a 56px top bar
  whose breadcrumb is the ontology path, and `AppShell`, which owns the one piece of shell state.
  A pane can ask for the width (`wantsWidth`), and the person's own click on the rail control wins
  over the request.
- Primitives in `components/ui/`: the verdict chip with no dot, the marked span in its five states,
  the hatch, the evidence well, the panel, the bar, the button, Radix-backed tabs with a shared
  layout underline, and the canvas's own glyphs lifted path for path into `icons.tsx`.
- The run page in its three states: running, a dependency down, finished. Two queues left to right,
  one panel per queue with a row per email holding a slot, and the outcomes list in the enum's own
  words. Checked in a browser on four real runs, including a genuinely held `classify` queue.
- The email page: the message as a bordered card, the labelled seam, the reading in plain English,
  then the seven fields. Tabs for `The check` (or `The case`), `Both documents` and `Model calls`.
  The documents tab closes the rail and folds the message to one line.
- The 340px chat column, present and inert, with its composer disabled and one sentence saying why.
- Motion through `motion` (motion.dev), vocabulary in `lib/motion.ts`. Nothing loops.

**New contracts**, each mirrored in `frontend/lib/api/` and in `03-infra-deep.md` section 10:

- `GET /runs/:id/queues` (`contracts.queues.ts`): the slots, who is next, `heldUntil`, and the
  handoff between the queues. The handoff is aggregated in the route, not in the page.
- `DocumentView.pageConfidence`, from migration `007_document_page_confidence.sql`. doc-extract
  already returned per page OCR confidence and nothing kept it; the review case needs it to say
  which page failed.
- `RunSummary.lastSubmission.scores.weights`, so the score panel reads the scorer's own weights
  (0.30 / 0.20 / 0.50) instead of assuming the 0.30 / 0.40 / 0.30 the canvas drew.

**Settled with the user**, and written into `05-design.md` section 4.5: both documents take the
mark on a differing field, and a value the judge called the same across different text keeps its
green. `components/email/field-reading.ts` holds the one `markOf` both screens use.

**Substituted, and why.** The canvas gives the middle panel of a finished run to memory. `core.lessons`
is phase 11 and the handover forbids faking a lesson or stubbing the table, so that rectangle holds
`What it took` instead: the run's own machinery, which `05-design.md` section 11 allows on this page
and nowhere else. Phase 11 takes the rectangle back.

**Deferred.**

- Rendered page images for an unreadable case. The exit checklist asks for them; the per page OCR
  confidence is real and shown, but the page itself is drawn as a hatched page-shaped block rather
  than a PNG. `docExtract.render`, a `/files/*key` streaming route and a `render` endpoint are the
  work, and none of it changes what the case tells a reader. Phase 8 needs `/files/*key` anyway for
  its upload path.
- `/review`, `/database`, `/ontology` and `/chat` are rail destinations that phases 8 and 10 fill.
  They are reachable and they are not built.
- A fixed bug found while checking this phase: `documents.upsert` gained a column and not its
  parameter, which failed every compare with `bind message supplies 9 parameters`. Caught on a
  real run, not by a test, because the repository tests fake the insert.

**The runs list, rebuilt after review.** It first got a mechanical token migration and kept its
phase 6 structure, which broke the language in five ways at once: uppercase table headers (retired
in 5.1), dollar costs and model call counts on a list (section 11 puts those on the run page's
machinery view and nowhere else), raw queue counters with `CLASSIFY_CONCURRENCY` and
`LLM_MAX_CONCURRENCY` named on screen, status as plain text rather than a chip, and ten prompt and
model dropdowns exposed before anything else on the page.

It is now a list: one two-line row per run, the whole row a link, status as a chip, what ended up
where in the organisers' enums, and the score right aligned in mono. Starting a run is `Emails`,
`Pace` and a button, with the eight experiment dropdowns behind a disclosure.

Its per row controls moved to the run page, where the canvas drew them and where phase 7 had left
them disabled although the routes work. `use-run-actions.ts` holds pause, resume, cancel, submit
and the local eval; the header carries whichever controls the run's status allows, and the score
panel carries submit and `Score it here`. All five checked against the live API.

**A fidelity pass against the canvas, board by board.** The first build was read against the
boards from memory; a side by side at 1440x900 found real gaps, and these were closed:

- The lane map was missing the three outcome chips at the end of the second lane and both drop
  rules that hang them under their card. The cards were 81px and unequal; they are 88px and equal
  now, with the arrows at the drawn 34px. The hung groups are positioned rather than laid out, so
  a wide group of chips can never widen its column and push the last card off the panel.
- The run page's display line was the email count. The board names the run, so it does too:
  `Morning run`, from when it started, with the count moved into the subtitle where the board has
  it. The email page's rail carries the same name over a progress bar, as the board draws it.
- Each queue panel's foot gained the standing count the board gives it.
- The message card states each attachment's size. `core.attachments.bytes` was already stored and
  `DocumentView` dropped it; the documents query already joined that table, so it was one column.
- The email list leads with `Differences`, as the board does, not `All`.
- The chat's opening turn was one line where the board's is a reading. It now says what differs
  and which agreeing fields the judge had to think about, which is what that pane is for.

**What still differs from the boards, and why.** Four of these are the canvas drawing a later
phase, and two are data the organisers' dataset does not carry:

- The board puts a time on every list row (`2m`, `4m`) and a date on the message header
  (`14 Mar, 08:12`). The inbox returns `email_id`, `from`, `subject`, `body` and `attachments` and
  nothing else: there is no timestamp anywhere in the dataset. Those are the designer's invention
  and are not reproduced.
- The board's rail carries a `Views` group of saved queries. Phase 10.
- The board's `Links to` strip names ontology records (`Client`, `Shipment`, `Same client,
  differed`). Those tables are phase 10b and are drawn `planned` on the canvas on purpose.
- The board's chat holds a conversation and a violet `correct_field` card. The chat is phase 10a
  and the write path behind that card is phase 8; the column is drawn and inert, which is what the
  handover asked for.
- The board's action bar is live. Phase 8.
- The board's rail shows four destinations on the email page and six on the run page. The build
  keeps the six everywhere, because one rail that does not change under you is the rule and the
  two boards disagree with each other.

**One shell over every route.** The first build left the phase 1 pages where they were, so the
rail's own destinations either 404ed or dropped a person into a different product: `/` was the
standalone Averis inbox in its own shell, `/mail/[id]` a second email page, `/chat` a phase 1 chat,
and `/review`, `/database` and `/ontology` did not exist at all. That is fixed:

- The phase 1 mail stack is deleted: `mail-shell`, `mail-list`, `email-view`, `chat-panel`,
  `paperclip-icon`, `lib/inbox.ts`, `app/actions/ai.ts`, `app/mail/` and `app/attachments/`. The
  email page under a run replaces all of it. `/files/*key` comes back in phase 8 for the uploads.
- `/` redirects to `/runs`. Retina opens on its runs; there is no landing page.
- `/inbox`, `/review`, `/database`, `/ontology` and `/chat` are one `Placeholder` component in the
  same shell, the same rail and the same type: what will be there, which phase builds it, and a
  line saying nothing is broken. A destination the rail offers always resolves.
- `/runs/[id]/results` moved into the shell, and its two components were rebuilt on the panels,
  bars and scale everything else uses rather than left as migrated phase 2 markup.
- `/login` was still referencing `bg-brand` and `border-brand`, tokens Air does not define, so its
  button and focus ring rendered as nothing. Rebuilt: the mark, the display face, one field.
- `app/not-found.tsx` keeps the shell. Walking off the end of the product should not look like
  leaving it.
- The password gate named `/chat` and `/runs` because the inbox was a separate public page. It now
  covers everything but `/login`, the API handlers and Next's assets. One gate, one matcher.
- The email page marks `Runs` in the rail, not `Inbox`: it lives at `/runs/[id]/emails/[emailId]`
  and the rail should say where you are.

Every route was then swept: all twelve answer, all twelve carry the rail and the display face,
and nothing in `frontend/` uses a Tailwind default type size, a grey that is not an Air token, a
drop shadow or an uppercase label.

**The run became the shell's context, not a page in it.** The rail changed shape on every
navigation: the run list showed no run block, the run page suddenly grew pinned prompts and an
inbox count, and clicking Inbox from inside a run showed no emails at all. The cause was that each
page handed the rail its own contents, and that a run was a destination beside the others rather
than the thing they are all read through.

- `AppShell` owns the run in context and fetches the run list and health itself. Every page passes
  which destination is current and nothing else, so the rail is identical on all of them.
- The rail's head is a run switcher: the run's name, its id, a progress bar, and a menu of every
  run. Switching keeps you where you are, so the inbox of one run becomes the inbox of another,
  which is how two prompt versions get compared on one screen.
- Every destination is run scoped: `/runs/[id]`, `/runs/[id]/inbox`, `/runs/[id]/review`,
  `/runs/[id]/database`, `/runs/[id]/ontology`, `/runs/[id]/chat`. The flat versions are gone.
  Without any run at all, every destination leads to the run list, which is where one is made.
- `/runs/[id]/inbox` is real: the same 300px list the email page carries, with nothing open.
- `/runs` is the one page with no run of its own and takes the newest as context, so it looks like
  the same application as everything else.
- `DELETE /runs/:id` (five tests). Every table referencing `core.runs` cascades, so it is one
  statement. A running run is refused with a message saying to cancel it first rather than being
  deleted from under its workers. The runs list carries the control, hover revealed, and it names
  what goes before it asks.

**Live feel on the run page.** The elapsed time on a queue slot jumped two seconds at a time,
because it was a duration computed at poll time. `QueueSlot.startedAt` and `QueuedEmail.queuedAt`
are instants, so `components/run/elapsed.tsx` counts up against a real clock at 100ms and the rule
along the row grows with it. It is not optimism: the instants are the worker's own, so this is the
real elapsed time measured continuously rather than sampled. The component owns its interval so the
panel does not re-render ten times a second.

The bars glide over 1.1s rather than settling in 0.3s of a 2s poll, and the cards' colours settle
over 500ms. `Reading` is `Classifying`, which is what the queue is called. Every card's unit was
shortened so none of them truncates. The crossing arrow gets a column wide enough for its label,
and both rows of the lane map now share one CSS grid, so a drop rule always hangs from the centre
of the card it belongs to and a wide group of chips cannot push the last card off the panel.

A held queue keeps its working rows: a rate limit stops new jobs starting and the ones already in
flight carry on, and hiding them said the queue had stopped dead.

**The indeterminate loader, and what section 9 now says.** A stage whose progress has no
denominator gets a looping sweep instead of a determinate bar: "8 of 8 slots busy" is not a
fraction of anything finished, and a bar that filled to 100 percent there was drawing a number
that does not exist. The same applies to a queue slot row, whose rule used to grow against a
"typical" call duration, which was a denominator invented for the drawing; the elapsed time beside
it is the real measurement. A stage that does have a denominator keeps its bar.

`05-design.md` section 9 said "nothing loops" and now says "nothing loops decoratively", which is
the rule that was meant: a loop encoding "there is no number here" carries information, and a pulse
beside a word that already says `Running` does not. Under `prefers-reduced-motion` the sweep is a
filled track.

Both bars stay mounted and cross-fade rather than one replacing the other. A CSS animation restarts
from its first frame every time its element is created, so a card flickering in and out of `live`
for a moment left the loader frozen at the left edge.

**Smaller things the same pass fixed.**

- Creating a run goes straight to its overview. Starting a run is asking to watch it, not asking
  to find its row in a list.
- The pause a dependency causes is a chip in the panel header with a tooltip, not a block the size
  of four rows in the panel body. "Rate limited" is BullMQ's word for it and a misleading one:
  nothing throttles throughput, `failure-policy.ts` catches a `DependencyUnavailableError` and
  tells the queue to start nothing new for thirty seconds. The copy says "paused" now, everywhere.
- The trouble banner on the run header is a chip beside the controls. It was 68px of layout
  appearing and disappearing on a thirty second cycle, and the whole page moved each time.
- Switching to `Both documents` no longer takes the rail and the email list away. `AppShell` lost
  `wantsWidth` entirely: the rail is open or closed because a person said so and for no other
  reason. The documents pane buys its width back inside itself instead, from the field column and
  the line-number gutter.

**A real finding, for phase 9 rather than this one.** BullMQ runs `CLASSIFY_CONCURRENCY` (8) plus
`COMPARE_CONCURRENCY` (4) jobs at once, and all twelve contend for the same eight model slots that
`llmSlots(LLM_MAX_CONCURRENCY)` hands out, because `LLM_MAX_CONCURRENCY` defaults to
`CLASSIFY_CONCURRENCY` alone. Eight classify jobs can hold every slot, so four compare jobs sit
blocked in the semaphore. That is exactly the shape of what the run page keeps showing: sorting
unaffected, checking held. Either the two concurrencies should be budgeted against one number, or
`LLM_MAX_CONCURRENCY` should be their sum and `proxy.yaml`'s `max_concurrency` raised with it.

**Known, and left for phase 9.** A run whose ingest has finished reads `completed` while its
queues are still full, and the API refuses both pause and cancel in that state, so the run page
offers neither. That is the API's rule and the page is drawing it honestly; stopping a run that is
still working wants a backend change, not a button.

**Fixed under phase 7, outside its scope.** A run whose ingest finished read as `Completed` while
its queues were still full: `status` is the ingest's and `processingDone` is the pipeline's. The
chip now says Running until `processingDone`.

Phase 5 merged to `main` on 2026-09-20. Every document's text is in MinIO under `text/`, typed
on its `documents` row; phase 6 reads it from there.

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
| 4, v3 + verifier, full inbox | 0.2996 | 0.2996 (scorer) | 0.9938 holdout, 0.9987 full | 0 | 0 | Run `69ee1e42`, started by the user, 520 emails at 8 in parallel in 7 min 46 s. 595 calls, 0 failed, verifier on 14.4%. One wrong category: `email_504`, SI_REQUEST for BL_COMPARISON |
| 4, v3 + verifier, dev sample | not run | not run | 1.0000 dev (30 of 30) | 0 | 0 | Run `0d09d887`, 30 train emails, 37 calls, 0 failed, verifier on 7 (23.3%), agreed every time. Not a holdout number |
| 5, structural escalations | not run | not run | n/a | 0 | 0 | Run `cd96e1c0`, 24 emails (the 20 edge cases and one pair per format): 14 escalated with the right reason, 0 failed. Not a scored number; the holdout is the user's to run |
| 6, extraction and judge, 24 train pairs | not run | not run | 1.0000 accuracy (all 24 BL_COMPARISON) | 1.0000 over 18 | 1.0000, 8 of 8 | Run `0011eb39`, 24 train ids (12 txt pairs, 6 binary-format pairs, 2 scanned, 4 missing_value): 8 MISMATCH with the exact field sets, 10 OK, 4 missing_value, 2 unreadable with provisional; escalation recall and precision 1.0. 146 calls, 0 failed, verifier on 1 of 48 documents. Macro-F1 reads 0.2 only because four categories are absent from the run. Not a holdout number |

Stage 1 carries 0.30 of the final score, so 0.3000 is exactly what a perfect classifier with no
document check gets, and `v3` is there. The holdout final cannot rise further until phase 5.

## Phase checklists
### Phase 6 (built 2026-09-20, local)
Exit checklist from `docs/phases/phase-06-extraction-and-comparison.md`, checked on run
`0011eb39` (24 train ids: `email_001`, `004`, `009`, `013`, `025`, `031`, `032`, `034`, `040`,
`043`, `044`, `046` as txt pairs; `055`, `107` xlsx+docx; `171`, `243` xlsx+xlsx; `059`, `208`
pdf+pdf; `513`, `514` scanned; `516`, `517`, `518`, `520` missing_value. 4 in parallel, 7 min,
146 calls, 0 failed). The holdout and the full 520 are the user's.
- [ ] End-to-end on holdout at or above 0.80; full-set final at or above 0.85: not run. On this
      run end to end is 1.0000 (8 of 8 defect emails with the exact field set) and stage 3
      defect-F1 1.0000 over 18 comparable emails. Not a holdout number.
- [x] Zero self-inflicted `missing_value` escalations on the main-500 pairs of this run: the 18
      pairs in four formats all ended OK or MISMATCH. The full run is the box the spec words.
- [x] The train `missing_value` emails (516, 517, 518, 520) escalate as `missing_value`, none as
      `MISMATCH`, each naming exactly the blank fields (`N/A`, `TBA`, `____MT`, an empty label).
      519 is a holdout id and was left out.
- [x] Port mutations with stale codes are caught: `email_013` `MOMBASA, KENYA (KEMBA)` against
      `TUTICORIN, INDIA (KEMBA)` and `email_025` `FREMANTLE, AUSTRALIA (AUFRE)` against
      `BUSAN, SOUTH KOREA (AUFRE)` both judged different, at 0.90 and 0.95, with the rationale
      naming the place.
- [x] Extraction verifier ran on 1 of 48 documents (2.1%).
- [x] Scanned pairs 513 and 514 escalate `unreadable` with `provisional` attached (both `OK` on
      the OCR text; the judge read `NANTONG CHIMA` and `FZ-LLG` as recognition errors at 0.85 and
      0.65). 512 is a holdout id and was left out.
- [x] Every judged field is in `field_diffs` (168 rows, 7 per judged pair) and every extracted
      value in `extraction_fields` with its quote; 0 of 336 stored fields failed the evidence check.
- [x] 410 backend tests, type-check clean in both packages, frontend lint clean.

What a run costs now, from `0011eb39` at API prices: extract 48 calls at 16.8 s and 2.11 USD,
field-judge 24 at 10.7 s and 0.81 USD, doc-type 48 at 6.3 s, classify 24 at 7.0 s; 4.25 USD for
24 emails. A comparable pair is six calls: classify, two doc-type, two extract, one judge, plus a
verifier where a quote fails.

Seen on this run and left as is: on the flattened xlsx and pdf documents (`055`, `059`) the
extractor returned the shipper with a second line or the address cells attached; the judge still
called the pair the same at 0.85 and 0.75. The extract prompt now says the name only, not the
cells after a bar; that sentence describes our parser's output format (`03-infra-deep.md`
section 6), not the dataset. A sentence about the second line itself was written and then
removed by the review pass below, because it came from the sample. Whether the pairs still read
the same is the holdout's to say.

### Phase 5 (built 2026-09-20, local)
Exit checklist from `docs/phases/phase-05-parsing-and-triage.md`, checked on run `cd96e1c0`
(24 emails: `email_001`, `005`, `055`, `059`, one pair per format, and `email_501` to `520`,
8 in parallel, 85 s, 68 calls, 0 failed). A full 520 run is the user's.
- [ ] All 250 attachments produce a `documents` row: 38 of 38 did on this 24-email run (24 txt,
      8 pdf, 3 xlsx, 1 docx, and the two garbled and six scanned PDFs are the only `unreadable` or
      `scanned` rows). Text is in MinIO under `text/`, page images for the scanned pairs under
      `pages/`. The box the spec words is the full 520 run, which is the user's.
- [ ] Exactly the 15 reference emails escalate, 14 of 15 on this run. The three reasons:
      `wrong_doc_type` on 501, 502, 503, 505 with the
      model's type, confidence and rationale (invoice, packing list, certificate of origin,
      certificate of origin); `missing_attachment` on 506 to 510 (three by the triage model on an
      empty request, two by code with the SI alone); `unreadable` on 511 to 515 (two would not
      open, three read by OCR and escalated as scanned with their page images). No other email has
      an open case; 516 to 520 (`missing_value`, phase 6) and the four normal pairs end `OK`.
      `email_504` is the one miss: the active classifier `v3` reads it as `SI_REQUEST`, the same
      miss phase 4 recorded, so it never reaches compare. See the `v5` line below.
- [ ] The 94 awaiting-draft emails end `OK` with `detail.awaiting_draft = true`: the mechanism is
      built and tested (the triage model reads the request; `send_draft` ends `OK`), but no
      awaiting-draft email was in this run. The full run will show it; the user runs that.
- [x] Python tests pass: 26 in `services/doc-extract` (25 here, the OCR one skipped without
      tesseract; all 26 inside the image, tesseract 5.5.0). A 0-byte file, a garbled PDF and an
      unknown extension answer HTTP 200 with `unreadable: true`.
- [ ] doc-extract on the box: `/health` shows `docExtract` up locally and in the simulator; the
      box gets it on the next deploy (compose.yaml changed, so `auto-deploy.sh` converges the
      whole stack). Someone with SSH checks `docker compose ps doc-extract` and `/health` after.
- [ ] Escalation recall 15/15 in `pnpm eval:score`: 14 of 15 on this run by the outcomes above
      (`email_504` misclassified). The scored number needs the answer key and is the user's run.
- [x] 354 backend tests and 25 doc-extract tests, type-check clean in both packages, frontend
      lint and ruff clean; the deploy simulator's suite passes with three new checks (doc-extract
      answers with tesseract, the worker reaches it by name, `/health` reports it).

What a run costs now, from `cd96e1c0` at API prices: classify 24 calls at 7.1 s, verifier 5 at
18.6 s, doc-type 36 at 5.8 s, triage 3 at 4.3 s; 1.10 USD for 24 emails. A comparison email with
two readable attachments is three calls; with none, two.

Classify `v5` reads the attachments' text. Run `ed20b880` pinned it on `email_501` to `505`:
see the line under "Found while building". It stays inactive until the user's holdout run says
it helps; to switch: `update core.prompt_versions set active = (version = 'v5') where step =
'classify'` and the same for `classify-verify` `v2`. The runs page pins it without that.

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

- [x] Stage 1 macro-F1 on the holdout at or above 0.95, with the verifier: 0.9938 (run `69ee1e42`,
      the user's full run; the one miss, `email_504`, is in the holdout). Phase 2's `v3` was
      1.0000 without it. **To run**: runs page, Emails = Holdout, New run; then
      `cd backend && pnpm eval:score --run <id> --holdout`.
- [x] The full-set confusion matrix: run `69ee1e42`, stage 1 macro-F1 0.9987, 519 of 520, on
      `/runs/69ee1e42-f2cb-46b3-8fd0-fb623e4e2d71/results`. 7 min 46 s at 8 in parallel.
- [x] The verifier ran on under 25% of emails: 14.4% of the full inbox (run `69ee1e42`). Dev sample: 7 of 30 (23.3%), but the sample is six
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
- [ ] The model comparison: one holdout run per alias under `v3`, Model = haiku, opus (the
      Qwen aliases went with Ollama, see Design decisions). Record macro-F1, the confusion matrix, cost per email and latency per email:
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
- 2026-09-19, **the llm-proxy is a service of our own compose stack**, decided with the user.
  No more remote proxy: the gateway transport to another Retina API's `/ai/chat` is deleted, and
  `LLM_PROXY_URL` names the `llm-proxy` service (`http://llm-proxy:4000` on the box,
  `http://127.0.0.1:4001` from the host locally). The container carries the Claude Code CLI and
  logs in with `CLAUDE_CODE_OAUTH_TOKEN` from `.env` (`claude setup-token`), not a mounted
  host login. **Ollama and the Qwen aliases are dropped**: the proxy serves sonnet, opus, haiku
  and the mock `test`. Same PR as phase 4 (#3), at the user's choice. Checked: `deploy/sim` 20
  of 20 on this branch (two new: the proxy answers inside the stack, and the api reaches it as
  `llm-proxy:4000`), 127 proxy tests on Linux, 256 backend tests, and the backend's own client
  against the built container (aliases listed, the mock answers, no login is a `TerminalError`).
  Not checked: a real Claude call through the container, which needs a token this machine does
  not have.
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

## Design decisions (phase 6 review pass, 2026-09-20)
Found by a reviewer given only the branch, `CLAUDE.md`, the spec and the checklist, with none of
the building session's context, and fixed on the same branch. The behaviour changes are the
first four.
- **The verdict is written before the courtesy.** A scanned pair's provisional comparison ran
  before the `unreadable` escalation was written, so a judge answer that never fit its schema on
  garbled OCR text failed an email whose verdict was already known, and the submission would have
  sent it as `OK`. The comparison now runs first inside a `TerminalError` guard, the escalation is
  written whatever it returns, and a failed comparison leaves `provisional: null`. Outages still
  pause the queue. A test drives the failing case.
- **Rows before the stage move, on every path.** The `missing_value` and scanned paths wrote
  `field_diffs` after `escalate` had moved the email to `review`, so a failed write was never
  retried: the retry hit the stage guard and the trace stayed empty. The comparison row and its
  judgements are now written first on every path, and the stage moves last.
- **The verifier replaces only the fields it was asked about.** Its answer replaced all seven,
  so a proven field re-copied with a slightly different quote was nulled and the pair escalated
  for a field the first reading had proved. The second reading is merged into the first on the
  doubted fields alone; a test re-copies a proven field with a bad quote and expects it kept.
- **A field given up on carries no evidence.** `evidence_ok` was computed after the unlocated
  fields were nulled, and a null with no placeholder passes the check by definition, so a value
  the verifier could not find was stored as proven and shown as "quote found". It is stored
  `false` now; the checklist's "0 of 336 failed" line above was partly this and is restated.
- **Two prompt phrases came from the sample, not the brief.** "A line saying on whose behalf the
  party acts" named a rendering the generator makes 56 times and the organisers' text never
  mentions; "TBC" and "N/A" are generator tokens where the brief lists `???`, underscores, `TBA`
  and `TBD`. Both removed; "or another stand-in for a value not yet known" stays.
- **A half-written extraction is no extraction.** The row and its seven fields are separate
  statements; a crash between them left a reading with fields missing that a retry read back and
  tripped over. `forDocument` now answers null for fewer than seven fields, and the retry reads
  the document again.
- **The judge's answer is reused on a retry**, as the handover said every step's should be:
  `llmCalls.latestAccepted` under the run's prompt version, parsed against the schema for the
  same fields, so a retry after a failed write costs no call.
- Also: the SQL fragment that names a defect field lives in `field-diffs.repo.ts`, the
  aggregate that owns the table, instead of one repository importing it from another; the seven
  field names are ordered in code, not in a third SQL copy; the frontend reuses the scoring
  schema's `ComparisonStatus` and shows an empty placeholder as such; the processor tests are two
  files, the pair path and the structural escalations, with a shared harness; and the infra doc's
  extract paragraph, decide pseudocode, timeouts line and write order now describe the code.
- Checked live after the fixes on run `7a6e83bd` (`email_004`, `513`, `516`, 18 calls, 0 failed):
  MISMATCH on consignee and notify_party, `unreadable` with a provisional `OK`, `missing_value` on
  the weight, the `N/A` still read as a placeholder without the token in the prompt.
- **Not changed, noted:** an absent field the extractor is unsure of still goes to the verifier
  (`fieldsInDoubt` on low confidence); on this run the model gave absent fields high confidence
  and 1 of 48 documents was verified, so the "under 20%" line holds. Watch it on the full run.

## Design decisions (phase 6)
- 2026-09-20, **the model reads and the model judges; code assembles.** Extraction is one call
  per document returning the seven fields verbatim with a `source_quote`; the comparison is one
  call per pair in which the field judge says, field by field, whether the two values denote the
  same thing. There is no normaliser, no label table and no suffix list in code: those were rules
  read off this generator (the phase spec's original items are in git history before this date).
  `assemble.ts` turns the judgements into the defect and missing sets and validates every name
  against the organisers' enum; `decide.ts` turns the sets into the status.
- 2026-09-20, **a side the extractor found nothing on is not sent to the judge.** The extractor
  already said the document does not give the value (a placeholder, or no label at all); code
  records the field as missing by that word and asks the judge only about fields with a value on
  both sides. The judge can still call one of those missing. The judge's schema is built per
  call from exactly those fields, so it can neither skip one nor answer for one it was not given.
- 2026-09-20, **a value that cannot be located is a missing value.** A field whose quote is not
  in the document after the verifier has read it again becomes `value: null` and the pair goes to
  a person as `missing_value`: the organisers' enum has one reason for uncertainty and none is
  added. A verifier whose answer never fits its schema degrades the same way; an outage pauses.
- 2026-09-20, **every judgement is stored, not only the differences.** `field_diffs` holds all
  seven fields of every judged pair, on a `missing_value` escalation and a scan's provisional
  result too, so the trace shows the whole comparison. `defect_fields` is derived from it (rows
  with `same` and `missing` both false), and the submission takes it from there.
- 2026-09-20, **images do not reach the model.** `proxy/proxy.yaml` denies image blocks for the
  `claudecli` provider (`claude -p` takes no image input), so the vision path of the design is
  off: a scanned pair is compared on its OCR text and the reviewer sees the page PNGs beside the
  provisional result. Nothing is wired for images.
- 2026-09-20, **`MISMATCH` is an outcome.** `email_runs.outcome` carries the comparison status,
  so the email list filters on it; `Outcome` gains the value in both contracts.
- 2026-09-20, **no few-shot examples for the three new steps.** They ship only when a holdout run
  shows they help, as the phase 4 rule says; `v1` of each is zero-shot.

## Design decisions (phase 5 review pass, 2026-09-20)
Found by a two-axis review of the branch against `CLAUDE.md` and the phase 5 spec, and fixed on
the same branch. The behaviour changes are the first three.
- **A wrong document is only wrong in a place it was meant to fill.** `checkStructure` checked
  every attachment, so a correct SI and BL pair with an invoice also attached was escalated
  `wrong_doc_type`, reproduced on a fixture. It now resolves roles first and checks only the
  files filling the SI and BL places; an extra is carried in `extras` as `triage` always meant it
  to be. The reference emails are unaffected: `email_501` to `505` name their wrong file
  `email_50N_BL.txt`, so it claims the BL place and is still checked.
- **A reading the model is unsure of does not park an email.** A document typed `OTHER` at 0.31
  escalated exactly as one at 0.97 did; `doc_type_confidence` was stored and shown but never
  read. `DOC_TYPE_TRUST_FROM` (0.7, in `pipeline/compare/structure.ts`) is now the bar, below
  which the file name's claim stands, as it already did for a document with no reading at all.
  **The number is a guess with one calibration point behind it** and is under Deferred.
- **A page with no text beside a page OCR could not read is unreadable.** `is_unreadable` only
  applied the confidence floor when every page came from OCR, so a mixed document fell through
  as readable whatever the recogniser said. It now asks per page whether anything can be worked
  from it, which subsumes the old all-`none` and all-OCR rules. Nothing had tested the floor.
- **One reading of the documents, shown rather than remade.** `documents-panel.tsx` decided on
  its own that a document disagreed with its name, by a different rule from the backend's, so a
  crossed pair showed amber beside an `OK` verdict. `documentVerdicts` now answers once and the
  api puts it on `DocumentView.typeVerdict`.
- **A crossed pair is said out loud.** The spec asked the swap to warn; it was silent. The
  `compare` outcome carries `swapped`, the comparison detail records it and the processor logs it.
- **Page images only for the files that need eyes.** Rendering covered every PDF among the
  documents, including readable ones. On this seed the set is identical (511 and 515 pair a bad
  PDF with a txt SI; 512 to 514 are scanned pairs), so this is waste removed, not behaviour.
- Also: `envModel` through the `agents` barrel; one `EmailRunIds` for the four copies of
  `{runId, emailId, emailRunId}`; one `DocumentFormat`; an `Outcome` enum for the email-list
  filter that the frontend reads instead of rebuilding; `SHIPPING_DOCUMENTS` in place of an
  enumerated complement; a pydantic `ErrorBody` for doc-extract's failure envelope; a named
  `Word` for PyMuPDF's word boxes; and `bytes` dropped from the triage types, where it was never
  read and the processor was filling it with the length of the extracted text.
- **Not changed, for you to rule on:** classify `v5` and `classify-verify v2` reading the
  attachments' text is outside the phase 5 scope line ("Out: LLM extraction, comparison, review
  UI"). It is seeded inactive and costs nothing until a holdout run says it helps, so it stands.

## Design decisions (phase 5)
- 2026-09-20, **the model types documents; code only combines claims.** Work item 5's fingerprint
  (title and label tables) was a rule read off this renderer. `prompts/doc-type/v1.md` reads each
  document's text and names it; `resolveRoles` takes the filename's claim first and the model's
  word only for a file that claims nothing, and swaps a pair the model reads the other way round.
  A document the model calls INVOICE, PACKING_LIST, COO or OTHER is `wrong_doc_type` whatever the
  name says; a disagreement between SI and BL is not, because neither is the wrong kind.
- 2026-09-20, **the input shape follows the pinned prompt.** `reads_attachments: true` in a
  prompt's frontmatter is what adds the "attachment contents" section, so `v3` runs exactly as it
  did and a run pinned to `v5` sees the text. Parsing happens once wherever it happens first
  (classify for such a run, compare otherwise) and the other stage finds the rows.
- 2026-09-20, **a scan is escalated, never silently trusted.** OCR text is stored, the document is
  typed from it, and the email still goes to review as `unreadable` with `scanned: true` and its
  page images, as the spec's policy says. Phase 6 adds the provisional comparison.
- 2026-09-20, **an email at `review` is finished for the run.** `finishedEmails` counts it, so a
  run with escalations reads as done and its clock stops; the email's `finished_at` is stamped.
- 2026-09-20, **doc-extract is a compose service with its own outage class.**
  `DocExtractUnavailableError` and `LlmUnavailableError` share `DependencyUnavailableError`, and
  `pausingOnOutage` (was `pausingOnLlmOutage`) pauses either queue on either, attempts untouched.
  A bad file is never an outage: the service answers 200 with `unreadable: true`.
- 2026-09-20, **`v5` and `classify-verify v2` are seeded inactive.** The eval harness, not the
  dev sample, decides a prompt switch; the runs page can pin them meanwhile.

## Deferred
- `EXTRACT_TRUST_FROM` (0.7, `pipeline/compare/evidence.ts`) is the classify verifier's bar
  carried over, not a measured one. On the 24-email check it sent 1 of 48 documents to the
  verifier; the holdout run says whether that is too few (a wrong value passing at 0.8) or fine.
- The field judge runs on every compared pair, one call each, about 11 s and 0.03 USD. The spec's
  original design had a judge only on party names that differed after normalising; that design
  was dropped with the normalisers. If cost matters on the full 520, the eval harness can say
  whether a judge on the fields whose values differ textually loses anything: that would be a
  rule again, so it needs the number first.
- The extractor's values on flattened xlsx and pdf documents (`email_055`, `059`) carried the
  address cells or the on-behalf-of line with the party name; the judge coped. The prompt was
  tightened after the run and not re-measured. Read the trace of a binary-format pair on the
  full run.
- Few-shot examples for `extract`, `extract-verify` and `field-judge`: none yet. `pnpm
  eval:examples` writes only classify examples; extending it is worth doing only if the holdout
  shows an extraction miss that an example would teach.
- `rerunFrom: "compare"` and `"extract"` from the spec's original item 10 are not wired: there is
  no review action yet to raise them (phase 8). The extraction is already reused from the
  `extractions` row on a second pass, so a rerun from compare costs one judge call.
- `DOC_TYPE_TRUST_FROM` (0.7) is not a measured number. It is the bar under which the doc-type
  model's reading does not displace the file name's claim, and the only calibration point behind
  it is the 0.62 misread below. The eval harness decides it: a holdout run that moves it to 0.5
  and to 0.85 and reads escalation recall and false escalations at each is what settles it.
- The doc-type model read `email_005_BL.xlsx` (title row `BILL OF LADING`, a flattened field list)
  as `SI` at 0.62. The filename's claim stood and the pair was compared, so nothing was lost, but
  the same reading on a file named nothing would make it `missing_attachment`. Watch it on the
  full run; if it repeats, the prompt's SI/BL paragraph needs a sentence on flattened
  spreadsheets, not a title rule.
- `email_504` reaches compare only if classification gets it right; the holdout run of `v5` is
  what says whether the attachments' text fixes that without costing elsewhere.
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
- ~~The box's proxy runs from the clone on the host.~~ It is the `llm-proxy` container now, built
  from the clone with the CLI pinned in `proxy/Dockerfile`. The box still needs, once, by someone
  with SSH: a `CLAUDE_CODE_OAUTH_TOKEN` in `~/retina/.env` (the wizard asks), and the old host
  proxy on `172.17.0.1:4001` stopped with its `@reboot` cron line removed (see `deploy/README.md`).
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
- ~~Structured output is not exercised on the gateway transport.~~ The gateway transport is
  deleted: every call now goes to our own proxy over the Anthropic wire, schema as a provider
  constraint.
- A token from `claude setup-token` expires (about a year). When it does, every model call fails
  as `provider_not_logged_in` and emails fail fast; nothing warns ahead of time. A `/health`
  check of the proxy's login would, but a real call per probe costs subscription usage.
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
- 2026-09-20, **the attachments' text first made classification worse, then better.** The first
  wording of `classify/v5.md` only said the contents were context. On `email_501` to `505` (an SI
  plus a wrong document) the model reasoned "no draft BL is attached, so the substance is the SI
  being handed over: stage 1", and the verifier `v2` agreed at 0.6 to 0.75: one of five right,
  where `v3` had four (run `ed20b880`). The fix is a principle, not a rule: at stage 3 the SI is
  already in hand as the reference for the check, so an SI beside a request to check or confirm
  is stage 3, and whether the draft arrived, or a file is what its name says, does not change the
  category (the organisers' own definition of the edge cases: all `BL_COMPARISON`, ending
  `NEEDS_REVIEW`). With that sentence, run `b18629b5` on the four train ids (`email_504` is a
  holdout id and was left out) read all four as `BL_COMPARISON` and escalated all four as
  `wrong_doc_type`. Four emails is not a measurement; the holdout run is.
- 2026-09-20, **the twenty edge cases are not in `dev`**: the dev sample is stratified from train
  by category, and 501 to 520 are all `BL_COMPARISON`. A phase 5 check is a run of explicit ids
  (`emailIds`), 20 to 25 emails, not the dev sample.
- 2026-09-20, **on this seed no attachment is 0 bytes**: the generator's `unreadable` flavour drew
  three image pairs and two garbled files. The empty-file path is covered by the service's own
  test, not by the inbox.
- 2026-09-20, **the api reloaded the new `/health` before the migration ran**, which is fine: the
  check hits doc-extract over HTTP and reads no table.
- The CLI streams a schema-bound answer after all: a StructuredOutput tool call whose input
  arrives as `input_json_delta` pieces. That is what makes the live preview possible. Two
  things seen in it: the model does not keep the schema's property order (it wrote `category`
  before `rationale` though the schema lists `rationale` first, so "rationale first" in the
  schema is a request, not a guarantee), and sonnet sometimes writes a malformed first attempt
  (`{"$PARAMETER_NAME": ...}`) that the CLI rejects before a valid one.
- A stream's `error` frame carried no `retryable`, so a streamed missing login read as an
  outage. Every error the proxy sends carries its verdict now, streamed or not.
- The frontend's catch-all turned a backend 401 into "Could not reach the backend", which hid a
  mismatched `API_SHARED_SECRET` between `frontend/.env.local` and `backend/.env`.
- A `claude -p` with no login exits 1 with `Not logged in` inside its JSON envelope, after a block
  of usage counters, and the proxy called it a generic provider error with `retryable: true`.
  Behind the backend's retry-on-verdict that is the phase 3 loop again: a missing secret read as
  an outage and every email requeued forever. Found by calling the container with no token
  before wiring it in; `ProviderNotLoggedIn` is permanent now.
- On this Windows checkout `proxy/start.sh` is CRLF in the working tree despite `.gitattributes`,
  so an image built locally from it gets a broken shebang. The Dockerfile runs uvicorn directly.
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
