# Phase 10f handover: what 10e built, what is still open in it, and the traps

Written 2026-09-20, after 10e was built on `phase-10e-interactive-chat`. Nothing below is a plan;
it is all on that branch. The branch is not merged.

Read in this order:

1. **Section 2**, what is still open in 10e. It is short, and one line of it is the only number
   that says whether any of this helped.
2. **Section 4**, the traps. Two of them are new.
3. `docs/phases/phase-10e-interactive-chat.md`, the spec, whose recipe table and exit checklist
   are both corrected in place.
4. `docs/03-infra-deep.md` sections 10, 11.1a and 11.1b.
5. `docs/phases/phase-10f-semantic-layer.md`, still parked. Nothing in 10e needed it, and the
   interactive questions are the evidence that decides whether it is ever needed.

---

## 1. What 10e built, so you do not rebuild it

| Where | What it is |
|---|---|
| `agents/chat/next-moves.ts` | Pure. `keepReal`, `problemWith`, `settle`. An alternative is real or it is not offered |
| `agents/chat/memory.ts`, `ontology/repositories/chat.memory.ts` | What a conversation remembers, by name and never by id |
| `agents/chat/skills/near-misses/`, `skills/ask-back/` | The two skills, injected on facts: an empty lookup, and candidates of more than one kind |
| `agents/chat/CHAT.md` v2, `prompts/chat/v3.md` | General knowledge may relate, never report. The four new final fields |
| `agents/chat/loop.input.ts`, `loop.result.ts`, `loop.skills.ts` | `loop.ts` split three ways, because `onStep`, the stop and the claims did not fit |
| `ontology/repositories/chat.live.ts` | The only read and write that see `role = 'tool'` rows |
| `routes/chat.turn.ts` | One turn end to end, load, call, save. `chat.routes.ts` is HTTP around it |
| `db/migrations/016_chat_live.sql` | `chat_turns.in_reply_to`, nullable, additive |
| `frontend/components/chat/` | `outcome-line`, `next-moves`, `clarify`, `live-steps`, `skill-picker`, `pending-turn`, `use-live-steps`, and `moves.ts` / `slash.ts` which hold the logic those draw |

**Numbers.** 857 backend tests, 70 frontend, none touching the proxy.

**Already wired, waiting for its other half:**

- `TurnResult.removedMoves` is computed on every turn and read only by the eval scorer. The page
  never sees it, deliberately: a reader should not learn what the agent nearly said.
- `standingVersion` is stored on every assistant turn and nothing reads it back yet. It is
  provenance, the same kind of thing `llm_calls.prompt_version` is: which instructions produced
  this answer.
- `ChatTurn.clarify` is drawn with its options disabled once a later turn exists. Nothing records
  which option was chosen; memory infers it from the next message, which is what the skill says.

---

## 2. Open in 10e

- **`pnpm eval:chat` has never been run in full.** Not in 10d, not here. The set is 45 questions
  (15 tagged `interactive`), about 150 sonnet calls, and it is the user's to start. **There is no
  baseline**, so "10d's numbers have not got worse" cannot be checked yet. Run 10d's 30 first if
  you want the comparison honestly: `pnpm eval:chat --limit 30`.
- **A live follow-up by pronoun has not been put to a model.** The repository half is held
  (`chat-search.test.ts`: a remembered canonical still grounds `exact` after every id changed by a
  refresh), and the prompt section is wired, but nobody has asked "and their notify parties?" of a
  live model.
- **`MAX_STEPS = 8` is still unmeasured**, three phases running. The live turns seen here took two
  to four steps. Measure on the interactive questions before touching it, and consider lowering it.
- **The clarifying path has not been seen live.** `ask-back` is injected only on candidates of more
  than one kind, which needs a name that is both a port and a party. The seeded inbox has none, so
  this is exercised by `inject.test.ts` and by the loop test with a scripted model, and by nothing
  else. A question like "Singapore" against the full inbox is the cheapest way to try it.
- Everything phase 11's handover listed and 10e did not touch: the action card is still inert, the
  rail's opening line is still `openingLine(trace)` and not a model turn, and per-email
  conversations still land in the `/chat` list.

---

## 3. Two decisions worth knowing before you change them

**Steps are rows, not a Redis key.** `phase-11-handover.md` section 3 proposed a progress key in
the existing `live/` store, and the 10e spec proposed rows; the spec won, so the rows exist and the
Redis path was not built. Do not build both. The cost of rows is one write per finished call and
one nullable column; the benefit is that a turn's steps are still there afterwards, which is what
phase 11's lesson drafter will want and a Redis key would not have given it.

**Stop is between steps, and a call in flight is paid for.** The loop reads the flag after a step's
calls finish. A model call already running is left to finish, because abandoning it would leave an
`llm_calls` row that no turn accounts for. That means a stop landing near the end of a turn lets a
whole answer be written: the browser re-reads `?after=` for twelve seconds and shows what landed,
rather than saying "stopped" over an answer that exists. If you make Stop cancel the call itself,
that recovery becomes dead code and the `llm_calls` row becomes the problem instead.

---

## 4. Traps

- **A stale api silently shadows a new one, and it happened again here.** The api on 8091 had been
  started with `nohup node ... src/index.ts`, with **no `--watch`**, so it served phase 10d code
  while 10e's files were on disk. It does not fail with EADDRINUSE and it does not reload. The tell
  is a new route answering 400 or 404 while an old one answers 200. `netstat -ano | grep 8091` says
  which PID holds it; check the command line for `--watch` before believing it is current.
- **`form_input` in a browser does not reach React's state.** Setting a textarea's value through
  the DOM leaves the component's `text` at `""`, so the send button stays disabled and Enter does
  nothing. Type the characters, or set the value through the native setter and dispatch an `input`
  event. This cost twenty minutes of thinking the composer was broken.
- **The email page needs the Averis inbox container**, not just postgres. `docker compose -f
  compose.local.yaml up -d` from `backend/` brings up all of it; starting only `postgres redis
  minio` leaves `/emails/:id` answering 503 and the email page rendering a server error that looks
  like a code fault.
- **`next dev` refuses a second instance** and tells you the first one's PID, so you cannot start a
  readable copy beside the user's. Its log is at `frontend/.next/dev/logs/next-development.log`,
  one JSON object per line, and that is where a server-side 500's stack actually is.
- **The frontend's vitest is `environment: "node"` and `*.test.ts` only**, deliberately: the config
  says rendering is checked by looking at the page. 10e's component logic was extracted into
  `moves.ts` and `slash.ts` so it could be tested under that rule rather than adding jsdom.
- **Everything in `phase-10e-handover.md` section 4 is still true**, `public.similarity` in full
  most of all: `profile_column`'s new `near` is another fixed query that fails as `retina_ro` if
  the schema is left off, and it is in the "as retina_ro" block for that reason.

---

## 5. Running it

```bash
docker compose -f compose.local.yaml up -d            # inside backend/, all of it
pnpm db:migrate && pnpm derive                        # 016 is additive
pnpm dev                                              # api on :8091, and only one, with --watch
pnpm dev                                              # inside frontend/, :3000
```

Without spending a token:

```bash
cd backend && pnpm vitest run test/agents/next-moves.test.ts test/agents/chat-loop.test.ts
cd frontend && pnpm test
```

For about four sonnet calls, the question this phase exists for:

```bash
cd backend && pnpm eval:chat --ids place-absent-country-present,a-true-miss-offers-no-neighbour
```

The first should answer `none_found`, say where it looked, and offer the one Indonesian port with
the number it read. The second should answer `none_found` and offer nothing at all: an invented
neighbour is worse than a plain no, because it reads exactly like a true answer.
