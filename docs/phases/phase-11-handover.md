# Phase 11 handover: what phase 10 built, what the chat still needs, and the traps

Written 2026-09-20 after phase 10 merged, and extended on 2026-09-21 after 10f. Nothing below is
a plan; it is all on `main`.

**10d, 10e and 10f each have a handover of their own**, and each is about the phase before it:
`phase-10e-handover.md` (10d to 10e), `phase-10f-handover.md` (10e to 10f). This file is the one
for phase 11, so **section 0 is what 10f left you** and the rest is phase 10's original. Where the
two disagree, section 0 wins: it is three phases newer.

**Phase 10 is semi done.** The data layer, the ontology surfaces and the read-only agent are
finished and tested. The chat works and is the part that needs refinement, and sections 3 and 4
are the list. Read them before you touch `agents/chat/`.

Read in this order:

1. **Section 1**, what is built, so you do not rebuild it.
2. **Section 3**, the chat's unfinished edges. This is the phase's real backlog.
3. **Section 6**, the traps. Two of them cost hours.
4. `docs/03-infra-deep.md` sections 5.6, 8.2 to 8.4, 10 and 11.
5. `docs/phases/phase-11-eval-and-lessons.md`, the work list.

---

## 0. What 10f left phase 11 (written 2026-09-21)

### 0.1 Two numbers nobody has taken, and both are yours

- **`pnpm eval:chat`** has never been run in full in 10d, 10e or 10f. 45 questions, 15 tagged
  `interactive`, roughly 150 sonnet calls. **There is no baseline**, so nothing can be said about
  whether any of the three phases helped. `pnpm eval:chat --limit 30` gives you 10d's original 30
  if you want the comparison honestly.
- **`pnpm eval:chat --set ontology`** has never been run. 21 questions, roughly 80 calls. It needs
  a backfilled inbox first: `pnpm ontology:backfill --limit 30` with a worker running, then two
  ten-minute ticks for the profiles. Its two numbers are recall and precision of the entity set
  against what `find_entities` returned, and how often a turn's completeness flag agreed with its
  own deferred count.

Until both exist, "the semantic layer helps" and "the semantic layer costs nothing it should not"
are both opinions.

### 0.2 What 10f built, so you do not rebuild it

| Where | What it is |
|---|---|
| `pipeline/ontology/reconcile.ts` | Pure. Plans each cluster onto the id that already holds its spellings. **Entity ids survive a refresh now**; a merge leaves a tombstone and every read filters `merged_into is null` |
| `pipeline/ontology/shipment.ts`, `shipment-reading.ts`, `shipment-draft.ts` | Pure. One email's reading into a shipment and its sightings, dropping any value whose quote is not in the text |
| `pipeline/ontology/resolve-sighting.ts`, `dossier.ts`, `profile-md.ts`, `plan-judging.ts` | Pure, all four table-tested. Which spellings cost a model call, what a profile is shown, how it renders, and which things a concept question judges now |
| `agents/shipment-read.ts`, `entity-resolve.ts`, `entity-profile.ts`, `concepts.ts` | The five steps, all sonnet, all prompts on disk |
| `ontology/concept-search.ts` | Define once, judge a bounded number, keep every verdict. Used by the tool and by the backfill, which never redefines |
| `queues/processors/ontology.processor.ts` + `-resolve` + `-write` | The queue's job: read, decide, write in one transaction |
| `queues/refresh-profiles.ts`, `backfill-concepts.ts` | The two scheduled tasks |
| `agents/chat/tools/find-entities.ts`, `skills/meaning-terms/` | The tool and the skill for a term no column holds |
| `db/migrations/017` to `022` | Four tables, one view, the profile columns, and three indexes the bench asked for |

**Numbers.** 941 backend tests, 70 frontend, none touching the proxy.

### 0.3 Three decisions worth knowing before you change them

**A profile has two halves and the label is the whole point.** `observed` is only what our mail
shows; `general` is the model's own knowledge, stored under the heading "General knowledge,
unverified" with a confidence. `CHAT.md` v3 lets the agent repeat what one says **with that label**
and never extend it. That is what makes `ONTOLOGY_KNOWLEDGE=mail+model` compatible with v2's rule
that general knowledge may relate and never report. If you ever drop the label from a surface, you
have turned a claim about the world into a claim about this mailbox, and nothing downstream will
notice.

**`unknown` is not a soft `no`.** `concept-judge` answers three ways and the counts are reported
separately, because "none of these" and "we do not know about these" are different sentences. The
prompt says so twice. A change that collapses them will read as an improvement on every question
that has an answer and as a lie on every question that does not.

**The ontology queue may never fail or slow a scored email.** Priority 2000, its own queue, a
failure that logs a warning and nothing else: no review case, no stage change. That is deliberate
and it has a cost, which is 0.5 below.

### 0.4 Traps, four of them new

- **The bench is the only thing that found the three missing indexes.** `pnpm ontology:bench`
  inserts 200,000 things and 2,000,000 sightings in a transaction it rolls back, and it caught a
  sequential scan on the exact-spelling lookup, another on the candidate ranking, and a 760 ms
  candidate search. If you add a query the chat makes per turn, add it to the bench.
- **Uniform synthetic data measures the wrong thing.** The bench's first version gave every row the
  same words, so every predicate matched every row and Postgres correctly chose a sequential scan.
  The names and trades vary for that reason; do not simplify them.
- **A rolled-back run still spends sequence values**, so ids are not contiguous and arithmetic on
  them joins to nothing. The bench numbers its rows with `row_number()` for that reason.
- **A backtick inside a SQL comment inside a template literal ends the template literal.** Two
  files cost a few minutes each to this. Write SQL comments in prose.
- **`shipment-read` is slow**, tens of seconds to minutes per email: a long prompt and a large
  output schema. At `ONTOLOGY_CONCURRENCY=2` a 25 email backfill is a quarter of an hour. Nothing
  is wrong; watch `core.email_shipments` filling rather than the log.
- **Everything in `phase-10f-handover.md` section 4 still applies**, the stale api on 8091 most of
  all.

### 0.5 What 10f deliberately left

Under "Deferred" in `PROGRESS.md`, with reasons. The three worth knowing here:

- **A failed reading has no surface.** It is a warning in the worker's log. If readings start
  failing quietly nobody finds out, and the first thing to give a surface is that.
- **`ambiguous` on a sighting is stored and nothing reads it.** `entity-resolve` sets it when the
  candidates spanned more than one thing. The clarifying path 10e built is the natural home.
- **`attributes_source.llmCallId` is always null.** The shape carries it; `callStructured` does not
  hand the id back and threading it through for provenance nobody reads yet was not worth the seam.

---

## 1. What phase 10 built

| Where | What it is |
|---|---|
| `db/migrations/010` to `014` | `analytics`, the `retina_ro` role, chat tables, the entity tables, and the grant `013` needed that `011` could not have given |
| `src/pipeline/ontology/resolve.ts` | Pure. Ports and parties clustered out of `extraction_fields`, joined only by a `field_diffs` row the judge wrote with `same = true` |
| `src/ontology/derived.ts` | Brings the views and the resolved things level with `core`, each on its own staleness check |
| `src/agents/chat/sql-guard.ts` | Pure. What a model-written query may be. 23 cases |
| `src/agents/chat/tools/` | The four tools behind one registry, with `describe_schema` reading `pg_catalog` |
| `src/agents/chat/loop.ts` | Eight steps, one flat step schema, one `llm_calls` row per step with `run_id = null` |
| `src/ontology/trace.ts` | One assembly of an email's story, shared by the trace page and two tools |
| `src/ontology/objects/` | One shape for every object type; the type registry with `navigable` |
| `src/mcp.ts`, `.mcp.json` | The same four tools over stdio |
| `frontend/lib/graph/layout.ts` | Pure, tested. Shared by the Links canvas and the chat's result graph |
| `frontend/app/runs/[id]/ontology/` | Things, Record and Links over one of five types, all three in the URL |
| `frontend/app/runs/[id]/chat/`, `components/chat/` | The page, and the rail on the email page |

**Numbers.** 615 backend tests, 48 frontend, none touching the proxy.

---

## 2. Four things the phase 10 spec got wrong, already corrected

They are marked **corrected** in `docs/phases/phase-10-analytics-and-chat.md`, and each has a test.
Do not re-introduce them from the spec's older prose: no `judge_used` column, nothing is ever
`decided_by = 'rule'`, the default tier is `core.default_tier()` and not a literal, and
`dim_client` drives off `core.emails` so it cannot contradict the clients page.

---

## 3. The chat is the unfinished part

Everything here works. None of it is broken. All of it is thin.

**Only one question has ever been asked of a live model.** "Which of the seven fields differs most
often?" on run `bd2f686e`, which answered correctly from one query over `analytics.fact_field_diff`
scoped to the conversation's run. That exercised `run_sql` and nothing else. **`get_email`,
`explain_decision` and `describe_schema` have never been called by a model**, only by tests with a
scripted one and by hand over MCP. Ask each of them a real question first; that is the cheapest
useful hour in this phase.

**The result graph's entity column is crude.** `run_sql` reports the distinct values of the result's
**first column** as the entities it touched. That is right for `select domain, count(*) ...` and
wrong for `select *`, where the first column is a primary key and the graph fills with row ids.
Either have the agent name the column that carries the subject, or drop entity nodes for a query
whose first column is a key.

**There is no live build.** `docs/design/ontology-patterns.md` section 3.3 asks for nodes appearing
as each tool returns, 160 ms fade and 4 px rise, the node being read carrying the live dot. What
ships is a static skeleton and an elapsed-seconds counter, because there is no streaming
(`01-product.md` section 7) and a turn is one request. The design calls this "the moment worth
rehearsing for the demo". Doing it properly needs the loop to emit per-step progress, which means
either SSE from `POST /chat/:id/messages` or a `GET /chat/:id/progress` the page polls while the
turn is in flight. **The second is much cheaper** and fits the existing `live/` Redis store the run
page already uses for in-flight model calls.

**The proposed action card is dead code in practice.** It is drawn, it is disabled, its contract is
settled in `03-infra-deep.md` section 5.6, and **nothing ever sets `proposal`**, so no reader has
seen it. Phase 11 turns it on. Two things 5.6 leaves for you: which case a correction on an
un-escalated email is addressed to, and the column that separates `Apply and remember` from
`Just this once`.

**The rail's opening line is not a model turn.** `openingLine(trace)` is phase 7's canned sentence
computed from the trace. It reads well and it is not the agent. If the rail is meant to open with
what the agent found, that is a turn nobody asked for and it costs a model call per email opened;
the current arrangement is the cheap one and it should stay until someone decides otherwise.

**The scope chips are thinner than the design.** `EmailCheck.dc.html` shows `17 memories` in
violet. There are no lessons yet, so the chips are the email, its documents and its calls. The
`memory` boolean on a chip exists and nothing sets it. Phase 11 builds lessons; that is when it
fills.

**`MAX_STEPS = 8` has never been tuned.** Eight steps on `claudecli` at about half a request a
second is potentially four minutes for one answer. Nothing measured whether real questions need
more than three. Measure before raising it, and consider lowering it.

**Conversations from the rail land in the `/chat` list.** The rail opens one per email titled
`About email_x`, scoped to that run, and `GET /chat/conversations?runId=` returns it alongside the
inbox-wide ones. After a demo the list is mostly per-email threads. Either filter the page's list
to conversations with no `email_id`, or group them.

---

## 4. What was fixed on the way out, so you do not hit it again

- **The step schema cannot be a union.** The provider refuses `oneOf` at the top level of a tool
  schema and reports it as a *retryable* 502, so the caller retries forever. `toOutputSchema`
  throws a `TerminalError` naming the fix. Any structured step with two shapes is one flat object
  narrowed after it parses.
- **The model was given the wrong end of the conversation.** `turns()` is `order by id asc limit n`,
  which is right for drawing a thread and wrong for history: past twenty turns the model got the
  opening exchanges and none of the recent ones. `recentTurns()` is the one the loop uses now,
  held by `test/repositories/chat.repo.test.ts`.
- **A grant does not reach a table a later migration adds.** `011` ran before `013`, so the three
  tables the ontology is made of were the three the agent could not read while its own
  documentation offered a query over them. **If phase 11 adds a table the agent reads, grant it in
  the same commit as the table.**

---

## 5. The ontology surfaces, and what was deliberately cut

The rail offers **five** types: Emails, Ports, Parties, Shipments, Carriers. The other seven
`ObjectType`s are real and are reached through an object rather than browsed, because nobody opens
a list of 3,178 Fields. `client` folds into `party`: a sender domain and a consignee are the same
company read two ways, and `/clients` is still where a tier is set. `TypeDescriptor.navigable` is
the one field that decides this.

**The database page is hidden, not removed.** `Destination.hidden` in `components/shell/nav.ts`.
`/runs/:id/database` still serves `As rows` and `As things`; deleting that one field puts it back
in the rail. It is kept because `As rows` with the SQL along its foot is the page that proves the
ontology is not a mock-up.

**Shipment and Carrier will never be `built` without a source.** Nothing in the organisers' seven
fields yields a booking or a vessel. They are drawn dashed. Building them means finding a source,
not adding a table.

**Only an email has a graph.** The Links tab is not drawn for a port or a party. Another type's
graph is a different set of relations, not a parameter.

---

## 6. Traps

- **A stale api silently shadows a new one.** On this box a previous session's `src/index.ts` keeps
  port 8091 and a newly started one logs `api listening` anyway rather than failing with
  EADDRINUSE. Every request goes to the old process, so new routes answer 404 and freshly written
  code appears not to exist. `netstat -ano | grep 8091` says which PID actually holds it, and it is
  often not the one that just logged. The same is true of `dev:worker` and one Redis.
- **`pnpm derive` after any migration that adds derived data.** A materialised view is created
  already populated, so on a fresh database the views are level with `core` while the resolved
  tables are empty. Two derived things, two staleness checks; `derived.ts` says so.
- **The box needs `PG_RO_PASSWORD` before its next deploy.** The api applies migrations before it
  listens and `011` creates the role, so a stack whose `.env` lacks it fails at boot rather than at
  the first question. `deploy/README.md` says how. Unlike `PG_PASSWORD` it is safe to change.
- **Runs cost real tokens** and `pnpm test` does not. No test may reach the proxy; they use fakes
  and recorded fixtures. One chat turn is up to eight model calls.
- Everything in `phase-08-handover.md` section 10 and `phase-09-handover.md` section 7 is still
  true.

---

## 7. Open, and deliberately not built

- **The full 520-email run against these pages.** The only 520-email run in the database had zero
  mismatches, so the ontology and database pages were verified against a 52-email run with 23. A
  fresh full run would exercise the resolver at the size the judges will see. This is the one
  unticked line on phase 10's exit checklist.
- **The column configurator** the canvas drew on the Record tab is gone rather than deferred. It
  configured a list of eleven values, its `Add` offered three kinds of column that do not exist,
  and two of its three tabs were dead. A computed column needs a table to configure, which is the
  database page's job.
- **`entity_names.joined_by = 'human'`** is allowed and nothing writes it. A `correct_field` says a
  value was wrong, which is not the same claim as two values denoting one thing, so joining on a
  correction would have been a guess. The path opens when the action card's apply path does.
- **The Earth view** (`04-phases.md` 10c) is untouched and still optional.
- `GET /review/stats` is built, tested and still drawn nowhere.
- Phase 6's holdout, phase 5's and phase 4's open items. `PROGRESS.md` lists them.

---

## 8. Running it

```bash
docker compose -f compose.local.yaml up -d   # inside backend/
pnpm db:migrate && pnpm derive               # 011 needs PG_RO_PASSWORD in .env
pnpm dev                                     # api on :8091, and only one
pnpm dev:worker                              # in another shell, and only one
pnpm dev                                     # inside frontend/, :3000
```

`pnpm test` in `backend/` (615) and in `frontend/` (48). `pnpm lint` in `frontend/` enforces the
200 line rule; tests are exempt.

To see phase 10 without spending a token:

```bash
curl -s 127.0.0.1:8091/ontology/types | python -m json.tool
```

Five types with live counts. `/runs/<id>/ontology?type=port&tab=things` opens a port and shows the
spellings the judge joined, which is the screen the whole ontology argument rests on. The chat
costs tokens: one question is up to eight model calls.
