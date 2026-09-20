# Phase 10e handover: what 10d built, and what the 10e spec gets wrong

Written 2026-09-20, after 10d merged to `main` (`d084406`). Nothing below is a plan; it is all on
`main`. The plan is `docs/phases/phase-10e-interactive-chat.md`, and section 2 here corrects it.

Read in this order:

1. **Section 2, before you write anything.** Six things in the 10e spec do not match what 10d
   ended up building, because the review changed 10d after that spec was written.
2. `docs/phases/phase-10e-interactive-chat.md`, the work list.
3. `docs/phases/phase-10d-chat-harness.md`: "As built" and "The review pass". Ten minutes, and it
   is why the code looks the way it does.
4. Sections 3 to 6 here.
5. `docs/03-infra-deep.md` section 11.

Branch `phase-10e-interactive-chat` from `main`. Commit one step at a time with short messages.

---

## 1. What 10d built, so you do not rebuild it

| Where | What it is |
|---|---|
| `agents/chat/CHAT.md` | The standing instructions every turn is given. Versioned in its frontmatter |
| `agents/chat/orientation.ts`, `orientation.repo.ts` | What the database holds right now, rendered. Kept on `chat_conversations.orientation` with a watermark |
| `agents/chat/skills/<name>/SKILL.md` | Nine skills. `registry.ts` loads them; a card per skill is always shown |
| `agents/chat/skills/<name>/recipes/*.sql` | Twenty recipes. `recipes.ts` parses the header (`name`, `version`, `about`, `params`, `returns`), runs `guardSql`, binds parameters |
| `agents/chat/grounding.ts` | Pure. The literal guard: `literalsIn`, `shown`, `ungrounded`, `refusalFor` |
| `agents/chat/tools/grounded.ts` | The guard as the tools apply it: the pure check, then `entitySearch.knownValues` |
| `agents/chat/inject.ts` | Pure. Which skills the harness injects, from facts, never from the question's words |
| `agents/chat/loop.ts`, `loop.steps.ts` | Up to four calls per step, run together. `FinishedCall` carries `text` (what the model reads) and `grounds` (what the data returned) |
| `agents/chat/standing.ts` | `CHAT.md`, the schema notes, the skill cards and the recipe signatures, read once |
| `agents/chat/tools/` | Seven new tools beside the old four, one registry, `args-signature.ts` derives each tool's argument shape from its zod schema |
| `ontology/repositories/` | `entities.search`, `entities.overview`, `emails.search`, `database.profile`, `orientation.repo`, `chat.state`, and `chat.repo` split into `chat.repo` and `chat.turns` |
| `eval/chat-score.ts`, `chat-eval.cli.ts`, `eval/chat-questions.json` | `pnpm eval:chat [--limit N] [--tag T] [--ids a,b]` |
| `test/chat-seed.ts` | A small invented inbox, seeded inside a test's transaction, resolved by the real resolver |
| `frontend/components/chat/reading.tsx` | The reading, the skills and the recipes, above the answer |

**Numbers.** 806 backend tests, 48 frontend, none touching the proxy.

**Already wired for you, waiting for its other half:**

- `inject.ts` already asks for `near-misses` when a lookup comes up empty. The skill does not
  exist, so `skillsToInject` drops it as unknown. Adding the folder turns it on.
- `TurnInput.pickedSkills` exists, `inject.ts` puts picked skills first, and `ChatSkillUse.how`
  already has `picked`. The route passes `[]`. The skill picker only needs `NewMessage.skills`
  and one line in `chat.routes.ts`.
- `ToolOutcome.empty` is set by every lookup tool, and `FinishedCall.cameUpEmpty` carries it.
- The loop already hands back a final step with an empty answer (`notes`, never shown as a tool
  call). The 10e rule "a final that breaks its own shape is handed back once" is the same
  mechanism: push a note and `continue`.

---

## 2. Six things in the 10e spec are wrong, checked against `main`

**`seenValues` does not exist. It is `grounds`, and the difference matters.** The spec's
`keepReal(next, seen)` says to drop an alternative "whose thing is not in `seenValues`". The
review found that a tool's `text` echoes what was asked for (`Looking for "Jakarta"`), so anything
checked against text is checked against the question. Build `keepReal` on
`calls.map((call) => call.grounds)` and `shown()` from `grounding.ts`, never on `call.text`. If you
check against text, the model can recommend Jakarta because it asked about Jakarta.

**`values_near` cannot be a recipe.** The spec lists it as "for a relation and column, the stored
values most similar to a text". A recipe takes bound parameters only, and an identifier cannot be
bound. The one place that interpolates identifiers safely is `database.profile.ts` (catalog check
with `has_column_privilege`, then `safeIdentifier`, then quoting). Give `profile_column` an
optional `near: string` argument instead, and rank by `public.similarity`.

**`entities_containing_word` already exists twice.** The `entities_named_like(kind, pattern)`
recipe and `list_entities { kind, contains }` both do it. Do not add a third. `port_roles` "for
given ports" is `ports_by_role` filtered; either add an `entity_ids bigint[]` recipe beside it or
let the agent read the rows it needs from the existing one, which returns every port of a run and
is small.

**The general-knowledge rule is a `CHAT.md` edit, and `CHAT.md` has a version.** The sentence to
replace is the last bullet under "What you cannot do". Raise `version` to 2 in the same commit;
`standing().version` is there to be stored on the turn and nothing stores it yet, so add it to
the turn's extras while you are in `chat.turns.ts`.

**Conversation memory is for the model, not for the guard.** The spec says memory lets a
follow-up "ground the remembered name again". After the review, nothing from earlier turns grounds
a literal: not the person's words, and not the agent's earlier answers, which repeat them. A
remembered canonical name still passes the guard, because `knownValues` finds it as a stored
spelling. So memory needs no change to `shownBefore`. Do not add history back into it.

**The migration number is 016, and check before you trust that.** `ls backend/db/migrations/`.
`db/migrate.mjs` applies by filename, so a duplicate number is a migration that silently never
runs. `phase-10-handover.md` records a spec getting this wrong three phases in a row.

---

## 3. Where your pieces plug in

**The final step's new fields go in `loop.steps.ts`**, in `Step`, which must stay one flat object:
the provider refuses `oneOf` at the top level and reports it as a retryable 502. Every new field
carries a default. `next` as an array of objects and `clarify` as a nullable object are both
fine; a union is not. `agents/structured.ts:toOutputSchema` throws if you try.

**`loop.ts` is 192 lines.** `onStep`, outcome validation and `keepReal` will not fit. Split first:
the prompt's `input` object (the eleven sections) is the natural thing to move, to
`loop.input.ts`. `eslint` does not cover the backend; the 200 line rule is yours to keep.

**Live steps: two ways, and the spec chose one.** The spec writes each finished call as a
`role = 'tool'` row and has the client poll `GET /chat/:id/turns?after=`. Know before you start:

- `chat.turns()` and `chat.recentTurns()` both filter `role <> 'tool'`, and the conversation's
  `turn_count` excludes them. That is deliberate and tested. Your new read must not go through
  them.
- `core.chat_turns` has `check ((role = 'tool') = (tool_name is not null))`.
- A step's calls finish together (`Promise.all`), so `onStep` fires per step with up to four
  calls, not per call. Showing them one by one means awaiting each; decide which you want.
- `phase-11-handover.md` section 3 proposes the other way: a progress key in the existing
  `live/` Redis store the run page already polls for in-flight model calls. It needs no migration
  and leaves no rows behind. Either is defensible; do not build both.
- `retina_ro` cannot read `chat_conversations` or `chat_turns` (they predate the default
  privileges in `014`). Nothing in the chat's own tools should need to.

**Any new tool must say what it grounds.** `ToolOutcome.grounds` is what the data returned and
nothing else: no echo of the input, no `purpose`, no error text. A tool that leaves it unset
grounds nothing, which is safe and makes every later filter on its results get refused. The four
tools whose whole text is stored data are listed in `TEXT_IS_DATA` in `tools/index.ts`.

**Any new recipe** needs the five header lines, `version` included, or the registry refuses to
load and every chat test fails at import. `recipes.test.ts` runs every loaded recipe as
`retina_ro` automatically; add its right-answer case to `recipes.seeded.test.ts`.

**The eval set.** `chat-score.test.ts` asserts the set has exactly 30 questions and 5 plain ones;
change both numbers when you add the 15. `--tag interactive` already works. The scorer needs new
behaviours (`outcome`, "every alternative is real", "asked" and "did not ask"); `Behaviour` is a
zod enum and `scoreTurn` is pure with a table test, so add a case per behaviour.

**The Jakarta walk-through's numbers are the full inbox's**, from the field survey. The local
database holds small runs, so the counts differ, but resolved things are built across every run
and the 28 ports are there: `BUATAN, INDONESIA` and `BUATAN, INDONESIA (IDBUA)` are two separate
things (no pair ever showed them together), both loading ports. That is a good test of the
`near-misses` skill's "one place can be several things".

---

## 4. Traps, each of which cost time in 10d

- **The chat reads as `retina_ro`, and the tests mostly do not.** Tools in tests read through the
  test's own transaction (`roPool: tx`) so they can see seeded rows, which is a superuser. The
  first live run failed on `word_similarity` because `pg_trgm` lives in `public`, off
  `retina_ro`'s search path (`analytics, core, pg_catalog`). **Write `public.similarity` and
  `public.word_similarity` in full**, in repositories and in recipes. `chat-search.test.ts` has an
  "as retina_ro" block; add every new fixed query to it.
- **`information_schema.columns` has no rows for a materialised view.** All four `analytics`
  fact and aggregate views are materialised. Use the catalog, as `database.profile.ts` now does.
- **The model guesses argument names it was not shown.** It wrote `name` for `text` three times
  running and ran out of steps. The tool list now carries each tool's shape, derived from the
  schema, so a new tool gets it for free. Keep argument names obvious anyway.
- **The model puts a recipe's parameters beside `name` as often as inside `params`.** The tool
  takes both. Anything that inspects a recipe call (the scorer, `keepReal`) must read both, or
  use `call.recipe.params`, which is normalised.
- **Sonnet occasionally sends a placeholder as its whole step**: `{"action":"final","answer":"test"}`
  once in about twenty-five live calls here. An empty answer is handed back; a non-empty placeholder is not
  detectable without a rule about what an answer looks like. With `next` and `clarify` on the
  final step, a placeholder becomes more visible, not less. Do not write a rule for it; note it
  if it recurs.
- **Entity ids do not survive a refresh.** `entities.replaceAll` deletes and reinserts. In a
  test, a second `seedInbox` changes every id: read ids from the last seed. In the product, a
  conversation remembers names.
- **A heredoc eats backslashes on this machine, Python included.** `python - <<'EOF'` with a
  `"\n"` inside writes a real newline into the target file and breaks a string literal. It
  happened five times in 10d. Write the patch script to a file and run the file, or edit
  directly.
- **Port 4000 is another project's proxy** (aliases `big`, `default`). This repository's is the
  `llm-proxy` service on 4001: `docker compose -f compose.local.yaml up -d llm-proxy` inside
  `backend/`. A wrong alias fails fast, by design.
- **`backend/.env` needs `PG_RO_PASSWORD` and `DATABASE_RO_URL`**, or migration `011` stops
  `pnpm db:migrate` and every tool refuses. `.env.example` has the local values.
- **The frontend's type-check shows about sixteen errors under `.next/dev/types/`** for routes
  that no longer exist. They are stale generated files, not yours: delete `frontend/.next`.
- **Runs cost real tokens and `pnpm test` does not.** A chat question is two to four sonnet
  calls, about 10 to 50 seconds. Use `pnpm eval:chat --ids a,b` while developing.
- Everything in `phase-11-handover.md` section 6 is still true.

---

## 5. Open from 10d

- **The full `pnpm eval:chat` has never been run.** Six questions were put to a live model, all
  of which pass now. The exit line "at least 70% of turns that queried answer from recipes alone"
  is unmeasured. **Run it once before you change a prompt**, so 10e has a baseline to be compared
  with; it is about a hundred sonnet calls, so ask the user first.
- **A turn's prompt is never trimmed.** Each call can return 20 kB. Near misses make more calls
  per turn than anything in 10d, so this is the phase where it may start to matter. The cheap
  fix is in the spec's Deferred: keep the last few results whole and older ones as previews.
- **Two posts to one conversation at once are not locked against each other.** The composer
  disables itself while a turn is pending, so it takes two tabs. A stop button and a skill picker
  both add ways to send; check you have not made it reachable from one tab.
- **`find_entity` scans every spelling.** Fine at hundreds. The fix is written down in the 10d
  spec under "Not changed".
- **`MAX_STEPS = 8` is still unmeasured.** A near miss is about four steps (look, widen, count the
  alternatives, answer). Measure on the interactive questions before touching it.

---

## 6. Running it

```bash
docker compose -f compose.local.yaml up -d postgres redis minio llm-proxy   # inside backend/
pnpm db:migrate && pnpm derive
pnpm dev                                     # api on :8091, and only one
pnpm dev                                     # inside frontend/, :3000
```

To see 10d without the frontend, and for about four sonnet calls:

```bash
cd backend && pnpm eval:chat --ids name-partial,name-absent
```

It prints each question's steps, seconds and the recipes used, and writes every answer and call
to `backend/eval/reports/` (gitignored). `name-partial` is the failure 10d exists to fix;
`name-absent` is the answer 10e exists to improve: today it says no and where it looked, and
offers nothing else.

Without spending a token:

```bash
cd backend && pnpm vitest run test/agents/chat-loop.test.ts test/agents/recipes.seeded.test.ts
```
