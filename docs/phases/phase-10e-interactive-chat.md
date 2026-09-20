# Phase 10e: An interactive chat: near misses, questions back, next steps

Written 2026-09-20 for the engineer who builds it, after `phase-10d-chat-harness.md`. Read
`CLAUDE.md`, the phase 10 handover, 10d, then this. The semantic layer (10f) is parked; nothing
here needs it.

## Goal

A question that has no direct answer still gets a useful one. Asked about shipments to
Jakarta, where there are none, the chat says so, says what it checked, and offers what is
there: the one Indonesian port in the data and the role it plays, and the nearest ports cargo
does go to, each with a number read from the database, each one click away. It asks when a
question could mean two things, proposes what to look at next, shows its work while it is
working, and lets the person pick a skill by hand. The model for the feel is Claude Code: you
see each step, you can stop it, and it hands you the next move.

## The worked example this phase is built around

"Do we have any shipments to Jakarta, Indonesia?" against the current inbox (values from the
field survey, `https://claude.ai/artifact/52y7ALXhGK2cvr51qtXKtA`):

- There are 6 loading ports and 26 discharge ports. None is Jakarta.
- One port is in Indonesia: `BUATAN, INDONESIA`, and it is a **loading** port (19 SI requests,
  24 documents), never a destination.
- The discharge ports nearest to Jakarta are `HOCHIMINH CITY, VIETNAM`, `CEBU, PHILIPPINES`
  and `YANGON, MYANMAR`; `SINGAPORE` and `PORT KLANG (WESTPORT), MALAYSIA` are nearby loading
  ports.

Today's answer is "none". The answer this phase produces:

> No. Nothing in run 69ee1e42 is shipped to Jakarta: I looked for it among the 32 ports read
> from documents, in subject lines and in email bodies, and found no mention.
> Indonesia does appear once, as an origin: BUATAN, INDONESIA is a port of loading on 24
> documents. The closest destinations cargo does go to are Ho Chi Minh City (11), Cebu (3) and
> Yangon (9). That these are near Jakarta is my own geography, not something in the data.
>
> `[Shipments loaded at Buatan]` `[Shipments to Ho Chi Minh City]` `[All destinations in South-East Asia]`

Every count in it was read on that turn. The geography is the model's, and is said to be. No
semantic layer is involved: the port list is short enough to show the agent whole (10d's
orientation), a port's name carries its country as a word, and relating Jakarta to the listed
ports is ordinary general knowledge.

## Prerequisites

10d merged: `CHAT.md`, the orientation, skills, recipes, `find_entity`, `list_entities`,
several calls per step, the guard and `seenValues`, event-driven injection.

## Scope

In: the answer's outcome and next moves, the `near-misses` and `ask-back` skills with three
recipes, the general-knowledge rule, conversation memory, live steps and stop, a skill picker
in the composer, contracts, frontend components, evaluation questions.

Out: anything the agent writes (phase 11's action card), streaming tokens of the prose, voice,
notifications, profiles and concepts (10f).

## Design decisions

1. **An alternative is real or it is not offered.** Each suggested alternative names a thing
   and a count, and code drops any whose thing and number did not appear in a tool result on
   this turn (10d's `seenValues`). The model cannot recommend a port that is not in the data.
2. **General knowledge may relate, never report.** The model may use what it knows to connect
   the person's term to values the tools listed: which listed ports are near Jakarta, which
   listed parties belong to a group, that "the Gulf" covers these listed countries. It may not
   state a fact about this mailbox from memory, and whatever it related is labelled as its own
   knowledge in the answer. This replaces v1's flat "do not fill a gap from general knowledge",
   and it is the whole of what this phase borrows from the parked semantic layer.
3. **Ask once, and only when the data makes the ambiguity real.** A clarifying question is
   offered when tools returned candidates of different kinds, or unrelated candidates with
   close scores. Never because a question is merely broad: a broad question gets a stated
   reading and an answer. One question per ambiguity; if the person ignores it, the next turn
   takes the best candidate and says so.
4. **Next moves are questions, written to be sent.** A chip's text is a full prompt the chat
   can answer, not a label, so clicking it is the same as typing it and needs no new route.
5. **Steps are rows as they happen.** The POST still holds until the answer, as today, so
   nothing is fire-and-forget and no queue is added. The loop writes each finished step to
   `core.chat_turns`, and the client polls the thread while its POST is pending. Stopping is
   the client aborting the POST; the loop checks between steps.
6. **The person can inject a skill.** A skill picked in the composer is injected exactly as an
   event-injected one is. It is a nudge, not a mode: the agent still follows `CHAT.md`.

## Work items

### 1. The answer's shape

`Step` (final) gains, all defaulted:

```ts
outcome: z.enum(["answered", "none_found", "partial", "needs_input"]).default("answered"),
checked: z.array(z.string()).default([]),        // places looked, in the reader's words
next: z.array(z.object({
  kind: z.enum(["alternative", "follow_up"]),
  label: z.string().max(60),
  prompt: z.string().max(300),
  thing: z.string().nullable().default(null),    // the value or name it is about
  count: z.number().nullable().default(null),
  basis: z.enum(["data", "general_knowledge"]),
})).max(4).default([]),
clarify: z.object({ question: z.string(), options: z.array(z.string()).min(2).max(5) }).nullable().default(null),
```

`agents/chat/next-moves.ts`, pure, table-driven test: `keepReal(next, seen)` drops an
`alternative` whose `thing` is not in `seenValues` or whose `count` does not appear beside it in
a result; caps at four; removes a move whose prompt repeats the question just asked. `outcome:
needs_input` requires `clarify`; `none_found` requires `checked`. A final step that breaks
either is handed back once, as a tool step naming no tool already is.

### 2. Skill `near-misses` and its recipes

`agents/chat/skills/near-misses/SKILL.md`. Injected by 10d's `inject.ts` when a tool returned
zero rows or `find_entity` found no exact match. What it standardises, in order:

1. Confirm the miss in every place the thing could live: resolved things, subject lines,
   bodies, sender domains. One step, several calls.
2. Widen by the parts of the term. A place has a city and a country: search the country as a
   word in port names. A company has a group word: search it alone.
3. Look at what does exist of that kind. The orientation lists the ports; `list_entities`
   reaches the rest.
4. Relate, using general knowledge, only among listed values: nearest, same country, same
   region, same group, same kind of goods. Say that this step is yours.
5. For each alternative, read its number with a recipe. Offer at most three, the most relevant
   first, and say what role each plays (a loading port is not a destination).
6. Answer `none_found` with `checked`, the alternatives in prose, and the same ones in `next`.

| Recipe | What it returns |
|---|---|
| `entities_containing_word` | things of a kind whose any spelling contains a word, with distinct emails and the fields they appear in |
| `port_roles` | for given ports: how often as loading, how often as discharge, distinct emails, in one run |
| `values_near` | for a relation and column, the stored values most similar to a text, with counts (trigram); for a column value that was mistyped |

### 3. Skill `ask-back`

When to ask and how: only on a real ambiguity (decision 3); the options are the candidates the
tools returned, in the reader's words with their counts ("Singapore, the port: 23 documents";
"companies with a Singapore address: 4"); plus one option that means all of them where that is
sensible. The question is the answer's prose; `outcome` is `needs_input`.

### 4. `CHAT.md` and prompt `chat/v3.md`

`CHAT.md` gains "When there is no direct answer" (point to `near-misses`), "When the question
could mean two things" (point to `ask-back`), the general-knowledge rule of decision 2 in
place of the old sentence, and "Ending an answer": up to three `follow_up` moves, each a
question this database can answer, none that repeats the turn, none that needs something the
harness cannot do. v3 differs from v2 only in describing the new final fields.

### 5. Conversation memory

The loop input gains "What this conversation already knows": for earlier turns, the things the
agent grounded and went on to use as `(kind, canonical, spellings)`, the run it answered for,
and an open clarifying question if the last turn asked one. Read from `core.chat_turns`
by `chat.repo.ts`; no new table. On a follow-up ("and their notify parties?") the agent
grounds the remembered name again by exact canonical, which is one indexed call and survives
an entity refresh. An answer to a clarifying question arrives as an ordinary message; memory
is what lets the agent read "the port" as the choice it offered.

### 6. Live steps and stop

- The loop takes an `onStep` callback; the route passes one that writes a `role = 'tool'` row
  per finished call (the table and the check constraint already allow it) with its `thought`,
  preview and duration. The assistant turn is written last, as today, and carries the same
  calls, so a thread read after the fact is unchanged.
- `GET /chat/:id/turns?after=<turnId>` returns rows newer than a turn id. `use-chat.ts` polls
  it with SWR every second while `pending`, and stops when the POST settles.
- Stop: the composer's button aborts the fetch. The route listens for `close` on the request
  and sets a flag the loop reads between steps; a stopped turn is stored as an assistant turn
  saying it was stopped, with what it had found. A model call already in flight finishes or is
  cancelled by the client's own abort signal; pass it through `callStructured` if `StructuredDeps`
  allows, and note it under Deferred if it does not.
- Migration `016_chat_live.sql` (check the number): `alter table core.chat_turns add column
  in_reply_to bigint references core.chat_turns(id)`, nullable, so live tool rows can be
  tied to the question they serve and hidden once the assistant turn lands.

### 7. The skill picker

`GET /chat/skills` returns the cards (name, `when`, version). Typing `/` in the composer opens
the list; choosing one adds a chip above the input. `NewMessage` gains `skills: string[]`
(max 3, each checked against the registry); the route passes them to `inject.ts` as a fifth
fact, "the person asked for it". Recorded in `skills_used` with `how: "picked"`.

### 8. Contract and frontend

`contracts.chat.ts`: the assistant turn gains `outcome`, `checked`, `next`, `clarify`;
`NewMessage` gains `skills`; `ChatSkillCard` and the turns-after response are new. Mirror in
`frontend/lib/api/chat-agent-schemas.ts`; write into `03-infra-deep.md` sections 5 and 11.

Components, one per file under `components/chat/`, Tailwind only, within the phase 7 design
language (no new colours: `none_found` uses the existing review verdict tone, not an error):

| Component | What it shows |
|---|---|
| `outcome-line.tsx` | for `none_found` and `partial`: one line, "Looked in: resolved ports, subject lines, bodies, sender domains" |
| `next-moves.tsx` | chips under the prose; alternatives first with their counts, then follow-ups; a `general_knowledge` basis shows a small "my inference" mark; click sends `prompt` |
| `clarify.tsx` | the options as buttons; click sends the option's text; disabled once answered |
| `live-steps.tsx` | while pending: each finished call as one line (tool, thought, preview, seconds), the running one with the elapsed clock; replaced by `tools-used.tsx` when the answer lands |
| `skill-picker.tsx` | the `/` menu and the chips |

`composer.tsx` gains the stop button while pending. The email page's 340px rail gets the same
components; check `next-moves` wraps at that width.

### 9. Tests

- Pure: `next-moves.test.ts` (an alternative not in any result is dropped; a count that does
  not match is dropped; a repeat of the question is dropped; four at most), final-step
  validation (`needs_input` without `clarify`, `none_found` without `checked`), `inject.test.ts`
  extended for picked skills and `near-misses`.
- Repositories: the three recipes against seeded rows; `turns(after)` returns only newer rows;
  memory reads the grounded things of earlier turns and an open question.
- `chat-loop.test.ts` with `FakeLlmClient`: a zero-row result injects `near-misses` and the
  final carries alternatives that survive `keepReal`; an invented alternative is removed and
  the answer still stands; two kinds of candidate produce `needs_input`, and the next message
  resolves it without asking again; `onStep` fires once per call in order; a stop between
  steps ends the turn with what it found; a picked skill is injected.
- Frontend (vitest, as phase 8's): chips send their prompt; clarify disables after use; live
  steps give way to the final tool list.

### 10. Evaluation

Fifteen more questions in `backend/eval/chat-questions.json`, tagged `interactive`, each with
the expected outcome and, for a near miss, the alternatives that should appear and ones that
must not. A place that is not in the data but whose country is; a place whose country is not
either; a company that is absent but whose group is present; a mistyped column value; a name
that is both a port and part of a company address; a vague word that should get a stated
reading and not a question; a follow-up by pronoun; a follow-up that answers a clarifying
question. `pnpm eval:chat --tag interactive` reports per question: outcome right, alternatives
all real (none removed by `keepReal`), relevant alternative present, asked when it should and
not when it should not, steps and seconds. Development runs use `--limit 6`; the full set is
the user's to start.

### 11. Manual verification

- The Jakarta question behaves as written above, with the three chips, and each chip's answer
  agrees with the count on it.
- "Shipments to Atlantis" (no place, no country): `none_found`, what was checked, no
  alternatives, and one follow-up offering the list of destinations.
- "Anything for April?" takes all the group's parties, says which, and does not ask.
- "Singapore" alone asks port or address once; answering "the port" does not ask again.
- "Which customers are big?" states its reading (by distinct emails, or by documented weight
  as written) and answers; it does not ask.
- During a long answer the steps appear one by one; Stop ends it and keeps what was found.
- `/lanes-and-ports` in the composer injects that skill and the turn records it as picked.
- The same behaviour in the email page's chat rail at 340px.

## Exit checklist

- [ ] The Jakarta walk-through passes as written, on the scoped run.
- [ ] No alternative in `eval:chat --tag interactive` names a thing or a count that was not in
      a tool result on its turn.
- [ ] A near miss reports the places it checked; a true miss offers no invented alternative.
- [ ] Clarifying questions appear only on the questions tagged to need one, once each.
- [ ] Every answer that used the model's own geography or group knowledge says so, and the
      chip is marked.
- [ ] Steps are visible while a turn runs; Stop works; nothing is fire-and-forget; a thread
      read afterwards is unchanged from 10d's shape plus the new fields.
- [ ] A follow-up by pronoun grounds from memory after an entity refresh.
- [ ] A picked skill is injected and recorded.
- [ ] 10d's `eval:chat` numbers have not got worse; both sets recorded in `PROGRESS.md`.
- [ ] `03-infra-deep.md` and the frontend zod mirror updated in the same commits; type-check,
      tests and lint clean; no file over 200 lines.

## Deferred

- Cancelling a model call already in flight, if `callStructured` cannot carry an abort signal
  without a wider change.
- Alternatives beyond what a name's words and the model's general knowledge can relate: "ports
  that serve the same trade", "customers like this one". That is what profiles and concepts
  were for; it stays parked in 10f until the interactive questions show a real gap.
- Remembering a person's preferences across conversations (always this run, always these
  parties). Needs an identity the password gate does not give.
- Proposed actions. The card exists and is inert; phase 11 owns what a turn may write.
