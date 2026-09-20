# Phase 10d: The chat harness: a starting point, skills and recipes

Written 2026-09-20 for the engineer who builds it, against the code on
`phase-10-analytics-and-chat`. Read `CLAUDE.md`, then `phase-10-handover.md`, then this.
`phase-10e-interactive-chat.md` follows it. The semantic layer (`phase-10f`) is parked and
nothing here depends on it.

Grounded in the inbox field survey (`https://claude.ai/artifact/52y7ALXhGK2cvr51qtXKtA`), whose
findings are summarised under "What the survey says the agent must know".

## Goal

A chat session starts knowing where it is. Before its first answer the agent has been told how
to begin, how this mailbox stores things, what the database holds right now, and which skills
and ready-made queries exist. It answers a recurring kind of question with the same vetted
query every time, and writes its own SQL only where no recipe fits. Nothing is rediscovered
from scratch in every session, so answers are faster and they are the same answer twice.

Four parts, in the order a turn meets them:

| Part | What it is | Who writes it |
|---|---|---|
| `CHAT.md` | The session's standing instructions: how to start, how the mailbox stores things, the rules of evidence. The chat's `CLAUDE.md` | a person, versioned |
| Orientation | What the database holds right now: runs, counts, the ports and parties that exist, what is missing | computed by fixed SQL, cached |
| Skills | How to do one kind of task here, with the recipes it uses | a person, versioned |
| Recipes | Named, parameterised, vetted SQL. The standard query for a standard question | a person, versioned, tested |

## The failure this fixes

Asked which shipments involve "April Paper Trading", the agent writes
`where canonical = 'April Paper Trading'`, gets no rows and reports none.

1. **It never saw what exists.** The stored spelling is `APRIL FINE PAPER TRADING (MIDDLE EAST)
   FZE`, one of four APRIL shippers. Nothing shows the agent the names; it has the question's
   spelling and no other.
2. **The prompt tells it to stop.** `chat/v1.md`: an empty result "is an answer... Do not go
   hunting". Right for a query built on values from the data, wrong for one built on a guess,
   and the prompt cannot tell them apart.
3. **It starts from zero every time.** It rebuilds the join from entity to email on each
   question, sometimes counting mentions as emails, sometimes across every run.

## What the survey says the agent must know

Structure goes in `CHAT.md`. Values never do: they change with a fresh seed and with every
run, so they come from the orientation and the tools.

| Survey finding | What the harness does with it |
|---|---|
| An email is five fields. No sent date, no recipient, no display name, no thread id. 267 of 520 have no date anywhere; the in-text dates contradict each other (218 of 258 weekday tokens wrong, December replies under January subjects) | `CHAT.md`: there is no sent time. `first_seen_at` is when we ingested it. Never order, age or window by a date read out of text; say so when asked |
| Sender, signature and greeting are independent (signature matches sender in 23 of 400; 121 external senders signed by exporter staff). Only the domain is reliable | `CHAT.md`: "who sent it" means the sender address and its domain. Never answer from a signature or a greeting |
| A company lives in four places: a resolved party (from documents, about 126 emails), a sender domain, a subject line, and the party blocks in the body of an SI request (all 125) | Skill `ground-names` checks all four and reports them as separate evidence |
| A port is written four ways: `NEW YORK_US` in a subject, `BALTIMORE` with the country dropped, `NEW YORK, US` in a body, `NEW YORK, US (USNYC)` in a document. 16 of 19 port defects keep the old LOCODE under a new name | `CHAT.md`: match a port by the words of its name, never by its code alone. A port name carries its country, so a country is searchable as a word |
| References (OC, BL, booking, invoice, PO numbers), vessel, carrier code, payment term, BL type and desk code live in subjects and bodies, not in columns. Booking and invoice references collide in shape | Skill `find-references`: text search, and say which kind of reference a hit looks like rather than asserting it |
| 91 zero-attachment "please send the draft BL" emails are `BL_COMPARISON` with status `OK` and nothing compared | Skill `counts-and-rates`: a comparison rate is over emails that have judged fields, not over the category |
| `core.emails.tonnage_mt` comes from a subject token that is containers times 20 to 25, not the documented weight | `CHAT.md`: never report it as weight. Weight is the `gross_weight_kg` field |
| 48 general and all 40 spam bodies are repeats; one email is an exact duplicate; every fact is stored per run | Skill `pick-the-run`: fix the run, count `distinct email_id` |
| Carriers, vessels, commodities, HS codes and people are not resolved things. Only ports and parties are | The orientation says so, so the agent does not look for a carrier table |

## Prerequisites

`phase-10-analytics-and-chat` merged. Nothing else.

## Scope

In: `CHAT.md`, the orientation, the skill and recipe registries with nine skills and about
twenty recipes, seven tools, several tool calls in one step, the literal guard, event-driven
skill injection, one migration, prompt `chat/v2`, contracts, `pnpm eval:chat`.

Out: recommendations, clarifying questions, suggested next steps, live progress, a skill picker
(all 10e); anything the agent writes; profiles, concepts, new entity kinds (10f, parked).

## Design decisions

1. **Structure is written, values are computed.** `CHAT.md` and the skills say how this
   mailbox stores things. They name no company, port, sender, vessel or subject code;
   `registry.test.ts`'s inbox-phrase check covers them. What exists right now is the
   orientation's job, and it is a query, so it is never stale and never fitted to one seed.
2. **Recipes first, SQL second.** A recipe is vetted, parameterised and tested, returns the
   same columns every time, costs a few tokens to call, and cannot contain an ungrounded
   literal because its values are bound parameters. `run_sql` stays for what no recipe covers,
   and a turn that needed it is marked `adhoc`, which is the backlog for the next recipe.
3. **The harness injects by event, the agent pulls by name, and code never reads the
   question.** No regex over the question and no keyword-to-skill table: that is a subject
   keyword table by another name. Injection fires on facts the harness can see (the
   conversation's scope, a zero-row result, a guard refusal, a skill already used in this
   conversation); everything else the agent asks for with `load_skill`.
4. **No separate planning call.** The earlier draft of this phase required one model call per
   turn just to plan. Several tool calls in one step do the same job for nothing: the first
   step grounds every name in the question at once. The guard is the net for a turn that skips
   it.
5. **Similarity proposes, the agent decides.** `find_entity` ranks candidates with `pg_trgm`
   and picks none. `resolve.ts`'s ban on edit distance is about merging spellings into one
   thing and stands untouched; this is search, and the choice is shown to the reader.
6. **One registry.** New tools go in `TOOLS`, so `src/mcp.ts` serves them unchanged, and each
   reports `touched` and `entities` so the result graph still draws from fact.
7. **`CLAUDE.md` changes in the same commit.** "Nothing else writes SQL except
   `agents/chat/tools/run_sql`" becomes "except the chat's `run_sql` and the recipe files under
   `agents/chat/skills/`, both of which run on `roPool` only".

Two properties of the built ontology to respect: **entity ids do not survive a refresh**
(`entities.replaceAll` deletes and reinserts), so an id is good within a turn and a conversation
remembers names; and **mentions are per `email_run`**, so an email replayed in five runs has
five sets.

## Work items

### 1. Migration `015_chat_harness.sql` (check `ls backend/db/migrations/` first)

```sql
create extension if not exists pg_trgm;
create index entity_names_trgm on core.entity_names using gin (value gin_trgm_ops);
create index entity_names_lower on core.entity_names (lower(value));

alter table core.emails
  add column search tsvector
  generated always as (to_tsvector('simple', coalesce(subject, '') || ' ' || coalesce(body, ''))) stored;
create index emails_search on core.emails using gin (search);
create index emails_subject_trgm on core.emails using gin (subject gin_trgm_ops);

alter table core.chat_conversations add column orientation jsonb;
alter table core.chat_turns
  add column skills_used jsonb,
  add column recipes_used jsonb,
  add column adhoc boolean;
```

`'simple'`, not `'english'`: a reference like `5RFR-36541` and a vessel name must not be
stemmed. Confirm in `deploy/sim` that the box's role may create the extension.

### 2. `agents/chat/CHAT.md`

One file, under 120 lines, frontmatter `version`. Injected on every turn in place of the
scattered advice in `chat/v1.md`. Sections:

- **How to start.** Read the orientation. Name the run you are answering for. For every proper
  noun in the question, ground it before anything else, all in one step. Prefer a recipe. Load
  a skill when its card matches.
- **How this mailbox stores things.** The structural facts from the table above, as rules.
- **Rules of evidence.** Every number comes from a tool result on this turn. Filter only on
  values and ids a tool returned. An empty result is an answer only when every filter came from
  the data; say what was checked, in which run, in which places. Say when a result was cut.
- **What you cannot do.** From v1, unchanged: no writes, no prompt text, no guessing.
- **The skills**, as cards (work item 4), and **the recipes**, as signatures (work item 5).

### 3. The orientation: `agents/chat/orientation.ts`, SQL in `orientation.repo.ts`

Fixed SQL on `roPool`, rendered to under 70 lines of text. Computed on a conversation's first
turn, stored in `chat_conversations.orientation` with the derived-data watermark it was read
at, and recomputed on a later turn only if `analytics.isStale` or `entities.isStale` moved.

- Runs: how many, the latest (id, size, when), the conversation's scoped run, its stage counts.
- The scoped or latest run: emails by category, comparisons by status, reviews by reason, how
  many emails have judged fields.
- Resolved things: count per kind. **Every port when there are 60 or fewer, otherwise the 40
  most mentioned and "N more, use `list_entities`".** The 40 most mentioned parties the same
  way. Each with distinct emails.
- Sender domains with email counts, up to 30.
- What is not here: no sent dates; carriers, vessels, goods, references and people are text,
  not things; when the derived data was last refreshed.

The pure half (`renderOrientation(snapshot)`) has a table-driven test, including the cap.

### 4. Skills: `agents/chat/skills/<name>/SKILL.md`

`registry.ts` loads the folder once, parses frontmatter with zod, exposes `skillCards()`,
`skillBody(name)` and `skillVersions(names)`.

```markdown
---
name: ground-names
version: 1
when: The question names a company, port, person, vessel or any proper noun.
recipes: [emails_for_entities, entity_roles, emails_by_sender_domain, subjects_like]
tools: [find_entity, get_entity, search_emails]
---
```

A card is the `when` line plus the recipe names: two lines per skill, always in the prompt. A
body is 20 to 60 lines, loaded on demand or injected: the steps in order, what goes wrong in
this schema, one worked example with placeholder names.

| Skill | What it standardises |
|---|---|
| `ground-names` | Find before filtering; take every candidate the name plausibly means and say which; join on ids through `core.entity_mentions`; check the four places a company lives and report each separately; ids are good for this turn only |
| `explore-values` | `profile_column` before filtering any text column that is not an enum |
| `pick-the-run` | Scoped run, latest run, and why counts across runs multiply |
| `find-references` | OC, BL, booking, invoice, PO, vessel, carrier code, term, BL type: `search_emails`, and how each is written in a subject |
| `time-questions` | There is no sent time; what `first_seen_at`, `started_at` and `finished_at` are; how to say that |
| `counts-and-rates` | The grain of each view, the right denominator, mentions against emails, `tonnage_mt` is not weight, views lag `core` by up to five minutes |
| `lanes-and-ports` | Loading and discharge from the SI side of `extraction_fields`; a disputed BL value is not a destination; country as a word in the port name |
| `quality-and-review` | Mismatches by field and by party, review reasons, what a reviewer changed, cost and latency per step |
| `explain-an-email` | `get_email` and `explain_decision` before any SQL on the trace tables (moved out of the base prompt) |

### 5. Recipes: `agents/chat/skills/<name>/recipes/<recipe>.sql`

```sql
-- name: emails_for_entities
-- about: The distinct emails in one run where any of these resolved things appears, with the field it appeared in.
-- params: entity_ids bigint[], run_id uuid
-- returns: email_id, subject, sender_domain, field, value
select distinct er.email_id, e.subject, e.sender_domain, m.field, m.value
  from core.entity_mentions m
  join core.email_runs er on er.id = m.email_run_id
  join core.emails e on e.email_id = er.email_id
 where m.entity_id = any($1::bigint[]) and er.run_id = $2::uuid
 order by er.email_id;
```

`recipes.ts` parses the header into a zod schema per recipe (types: `uuid`, `text`, `int`,
`bigint[]`, `text[]`), passes every file through `guardSql` at load so a recipe that could
write never registers, and refuses a duplicate name. The starting set, each with a repository
test against seeded rows:

| Skill | Recipes |
|---|---|
| `pick-the-run` | `latest_run`, `run_overview` |
| `ground-names` | `emails_for_entities`, `entity_roles`, `entities_named_like`, `emails_by_sender_domain`, `subjects_like`, `parties_seen_with` |
| `lanes-and-ports` | `lanes`, `ports_by_role`, `emails_for_lane` |
| `counts-and-rates` | `emails_by_category`, `comparisons_by_status`, `judged_emails` |
| `quality-and-review` | `mismatches_by_field`, `mismatches_for_entities`, `reviews_by_reason`, `human_corrections`, `cost_by_step` |
| `find-references` | `emails_mentioning` |

No recipe parses a number out of a value string. Counting containers or summing weights from
`1 x 40'HC` and `21,577 KG` in SQL would be a hand-written normaliser, which `CLAUDE.md` bans;
those questions are answered from the values as written, or said to be out of reach.

### 6. Seven tools, in `agents/chat/tools/`

| Tool | Input | Returns |
|---|---|---|
| `run_recipe` | `{ name, params }` | the rows, the SQL as run with its parameters shown, the recipe's version. Params are validated by the recipe's schema; an `entity_ids` or a `text` param is checked by the guard like any literal |
| `find_entity` | `{ text, kind? }` | up to eight candidates: id, kind, canonical, the spelling that matched, how (`exact`, `same ignoring case`, `similar`), score, mentions, distinct emails. Plus `elsewhere`: sender domains and up to five subjects containing the text's words |
| `list_entities` | `{ kind, contains?, limit? }` | names of a kind with counts, optionally those containing a word |
| `get_entity` | `{ id }` | every spelling with `joined_by`, mentions by field, distinct emails, runs, first and last seen |
| `profile_column` | `{ relation, column }` | row, distinct and null counts, the 30 most frequent values, min and max. Identifiers checked against what `retina_ro` may read (reuse the check in `database.repo.ts`), then quoted |
| `search_emails` | `{ text, runId?, limit? }` | emails whose subject or body match (`websearch_to_tsquery('simple', …)`, trigram on subject as fallback), with sender, subject and a `ts_headline` snippet |
| `load_skill` | `{ name }` | the skill's body and its recipes' signatures |

Fixed SQL lives in `entities.search.ts`, `emails.search.ts`, `database.profile.ts`. `find_entity`
orders exact, then same ignoring case, then `word_similarity(text, value) > 0.3`; the threshold
bounds the list and decides nothing.

### 7. Several calls in one step

`Step` gains `calls: [{ tool, args, thought }]`, one to four, replacing the single
`tool`/`args` pair (keep the old pair parsed for one version so a stored transcript still
reads). The loop runs a step's calls in parallel and transcribes them in order. `reading`, one
sentence on how the question was read, is asked for on the first step and shown to the person.
This is what makes "ground every name first" cost one step and not one per name, and it is the
largest single saving in the phase: a claudecli call is five to ten seconds. `MAX_STEPS` stays
8. `loop.ts` is near 200 lines already: move the schema and transcript helpers to
`loop.steps.ts`.

### 8. The literal guard: `agents/chat/grounding.ts`, pure

- `literalsIn(sql)`: string literals, by a small tokenizer that knows `''` and dollar quoting.
- `seenValues(transcript, orientation)`: every cell and candidate the tools returned on this
  turn, plus everything the orientation listed.
- `ungrounded(sql, seen)`: literals not in `seen`, not an enum value (the organisers' and our
  own `stage`, `decided_by`, `kind`, `joined_by`), not a uuid, number or date, and not a
  pattern containing `%` or `_` (a `like` search is exploration and is allowed).

`run_sql` refuses a query with ungrounded literals before running it and says which tool to
call. `run_recipe` applies the same check to its text parameters. When a grounded query returns
0 rows the tool appends a diagnosis: the run filtered on and its size, and the nearest stored
values to each literal.

### 9. Injection: `agents/chat/inject.ts`, pure

`skillsToInject(state)` from facts only:

| Fact | Injected |
|---|---|
| conversation scoped to an email | `explain-an-email` |
| conversation scoped to a run | `pick-the-run` |
| the guard refused a query on this turn | `ground-names` |
| a tool returned zero rows or `find_entity` found no exact match | `ground-names` now; `near-misses` when 10e adds it |
| a skill was loaded earlier in this conversation | that skill, without spending a step again |

Each injected body appears once per turn under "Skills for this turn". At most three; beyond
that the cards are enough.

### 10. Prompt `chat/v2.md`, `schema-docs.md`, contracts

v2 is short: role, the step protocol with `calls` and `reading`, how to write the answer (from
v1), then the sections the loop supplies: `CHAT.md`, orientation, skills for this turn, schema,
scope, history, transcript, question. `core.prompt_versions` gains the row, inactive.
`schema-docs.md`: `core.entity_mentions` gets its grain stated, `core.emails.search` is added,
and its worked examples shrink to the ones no recipe covers.

`contracts.chat.ts`: `ChatToolName` gains seven; `ChatToolCall` gains `recipe: { name, version,
params } | null`; the assistant turn gains `reading`, `skillsUsed: [{ name, version, how:
"injected" | "loaded" }]`, `adhoc`. Mirror in `frontend/lib/api/chat-agent-schemas.ts`, write
into `03-infra-deep.md` sections 5 and 11. Frontend in this phase: `tools-used.tsx` labels the
new tools and shows a recipe call as its name and parameters above the SQL; the reading is one
line above the prose. Nothing else until 10e.

### 11. Tests

- Pure, table-driven: `grounding.test.ts` (escaped quotes, dollar quoting, enum, uuid, `like`
  pattern, a literal seen in a candidate list or the orientation, one seen only in the
  question), `inject.test.ts`, `renderOrientation`, recipe header parsing (bad type, missing
  param, duplicate name, a recipe `guardSql` refuses), skill registry, `registry.test.ts`
  extended over `CHAT.md`, skills and recipe comments.
- Repositories, rolled-back transaction: every recipe against seeded rows, asserting its
  declared columns; `emails_for_entities` returns one row for an email replayed in two runs
  when one run is asked for; `find_entity` ordering and `kind`; `profile_column` refuses a
  relation `retina_ro` cannot read; `search_emails` finds a hyphenated reference whole.
- `chat-loop.test.ts` with `FakeLlmClient`: two names are grounded in one step; a recipe call
  carries its SQL and version to the turn; an ungrounded literal is refused and the corrected
  call runs; a grounded empty result carries the diagnosis; a zero-row result injects
  `ground-names` on the next step; a sticky skill is injected on the next turn; the orientation
  is computed once per conversation and again after the watermark moves.
- `mcp` test: the seven tools are served with the same schemas.

### 12. Evaluation: `backend/eval/chat-questions.json` and `pnpm eval:chat`

Thirty questions written by a person from the inbox and the documents, never from
`ground_truth.json`, each with the expected things by name, the expected behaviour, and where
it is a count the number from a hand-written query. Drawn from what the survey shows people
will ask: a partial company name, a group name that matches several parties, a port by city
alone, a port by country, a company that is both a sender domain and a consignee, an OC number,
a BL number, a vessel, a carrier code, a payment term, "who sends us the most", "which field
differs most", "what did reviewers change", a date question (must say there is no sent time), a
weight question (must not use `tonnage_mt`), a comparison rate (must use judged emails), and
five plain questions.

`pnpm eval:chat [--limit N]` reports per question: steps, model calls, seconds, recipes used,
`adhoc` or not, guard refusals, grounded before first filter, expected things present. It
spends tokens: development runs use `--limit 8`; the full set is the user's to start. **`v2`
becomes active only when it beats `v1` on correctness and is no slower on the plain
questions**, and both numbers go in `PROGRESS.md`.

## Exit checklist

- [ ] A new conversation's first turn carries `CHAT.md`, the orientation and the skill cards;
      the orientation is stored and is recomputed only when derived data moved.
- [ ] No turn in `eval:chat` filters on a name it had not seen in a result or the orientation.
- [ ] At least 70% of `eval:chat` turns answer from recipes alone; every `adhoc` turn is listed
      in `PROGRESS.md` as a candidate recipe.
- [ ] Two names in one question are grounded in one step.
- [ ] Median model calls per turn in `eval:chat` is no higher under `v2` than under `v1`.
- [ ] Every recipe has a test, declares its columns, passes `guardSql`, and shows its SQL and
      version on the turn.
- [ ] `CHAT.md`, every skill and every recipe comment pass the inbox-phrase check.
- [ ] The seven tools are in `TOOLS`, served over MCP, and report `touched` and `entities`.
- [ ] `CLAUDE.md`'s SQL rule, `03-infra-deep.md`, `schema-docs.md` and the frontend zod mirror
      updated in the same commits; type-check, tests and lint clean; no file over 200 lines.

## Deferred

- `word_similarity > 0.3`, eight candidates, four calls per step, the 60 and 40 caps in the
  orientation: starting values, to be measured on `eval:chat`.
- Recipes proposed by the agent from an `adhoc` turn that worked. It needs a person's approval
  and a test before it registers, which is phase 11's lesson gate; until then the `adhoc` list
  in `PROGRESS.md` is the queue and a person writes the recipe.
- Skill choice by retrieval. Nine cards fit in a prompt; do not build a skill search until
  they do not.
- Stable entity ids and anything that gives a name a meaning: 10f, parked.
