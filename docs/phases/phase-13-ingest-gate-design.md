# The ingest gate: admission control in front of the pipeline

Date: 2026-09-21. Phase 13.

## The problem

Every email that reaches `ingestEmail` costs money. Classify, the classify verifier and triage are
three model calls before anything is known about it; each attachment adds a doc-type call, an
extract call and an extract verifier; an email carrying two documents adds a field judge per
disputed field. An inbox the pipeline does not control can therefore spend an unbounded amount of
someone else's money, and the way to do it is not clever: send a lot of mail, or send mail with a
lot in it.

Today this cannot happen, because `ingest/` replays one fixed inbox that the organisers wrote. The
moment a mail connector is the source, it can. `Source` is already the seam that would carry it,
and nothing behind that seam asks whether an email is worth reading.

## What this builds

One deterministic gate between an email arriving and the pipeline spending anything on it. It
reads counts, sizes and timestamps. It does not read the words in an email, it does not call a
model, and it never decides what an email is. It decides one thing: whether we pay to find out
now, or hold it for a person.

## What this is not

- **Not a classifier.** No verdict here reaches a category, a status or a review reason. The gate's
  output is `admit` or `hold` and nothing else, and the email it admits is classified by the model
  exactly as it is today, whoever sent it.
- **Not content inspection.** No keyword table, no regex over a body, no sender list fitted to one
  seed of one dataset. The inputs are how much, how often, and since when.
- **Not a model.** Same inputs, same verdict, every time, and each of the four deciding functions
  is pure and covered by a table-driven test.
- **Not a deleter.** Nothing the gate does destroys mail. The worst outcome is a row in a holding
  pen with a button beside it.

## The threat model, and the one thing it forces

The user's answer to the trust question was: assume only the `From` header. No DKIM, no SPF, no
provider-verified address. An attacker can therefore put any domain in `From`, including a
customer's.

That has one consequence that shapes the whole design. If an automatic rule could blacklist a
sender, an attacker could blacklist your best customer by forging their domain and flooding you.
So:

> **An automatic rule may only ever hold. Only a person may block.**

A hold is cheap and reversible and visible. A block is a decision someone made and can unmake. The
machine never makes it. This also means the gate degrades honestly: the worst an attacker achieves
by forging a good domain is that the good domain's mail waits in a queue a person is already
looking at.

The corollary is that per-sender limits are a fairness mechanism, not the money guarantee. The
money guarantee is the global budget breaker in section 6, which does not care who anybody claims
to be.

## 1. Where it sits

```
replayRun
  -> ingestEmail(runId, emailId)
       source.getEmail(id)            <- already needed to know who sent it
       gate.admit(record)             <- NEW. one indexed query, one Redis call
         admit  -> storeAttachments -> rows -> enqueue classify   (as today)
         hold   -> core.emails row, a gate_decisions row, nothing else
```

A held email costs one `getEmail`, one Postgres read, one Redis round trip and two small writes. No
object storage write, no job, no model call. The assertion that matters is a test: after a held
email, `core.llm_calls` has no new row.

The gate goes before `storeAttachments` on purpose. Copying a 50 MB attachment into MinIO is
already the attack succeeding at a smaller scale.

## 2. The unit: what an email costs

Not emails per minute. The attack described is volume of text and attachments, and a limiter that
counts envelopes does not see it. The gate meters **cost units**, where one unit is roughly one
model call's worth of pipeline work. This is arithmetic over the record, and it is pure.

```
UNITS_PER_EMAIL        = 3     classify, classify-verify, triage
UNITS_PER_ATTACHMENT   = 3     doc-type, extract, extract-verify
UNITS_PER_COMPARISON   = 7     one field judge per organiser field, charged once at two or more documents
FREE_BYTES             = 262144   what an ordinary email with two shipping documents weighs
OVERSIZE_BLOCK_BYTES   = 102400   every 100 KB past that is one more unit
```

```
units(record) = UNITS_PER_EMAIL
              + UNITS_PER_ATTACHMENT * attachments
              + (attachments >= 2 ? UNITS_PER_COMPARISON : 0)
              + floor(max(0, bytes - FREE_BYTES) / OVERSIZE_BLOCK_BYTES)
```

`bytes` is the length of subject plus body, plus each attachment's size where the source states one
and `UNKNOWN_ATTACHMENT_BYTES = 131072` where it does not. `EmailRecord` gains an optional
`attachment_bytes`; the Averis source fills it from the inbox listing, and a source that cannot
still gets a deterministic number.

An ordinary email with an SI and a BL is `3 + 6 + 7 = 16` units. That number is shown on the page
with its breakdown, because a limiter nobody can explain is a limiter nobody will leave switched on.

**An honest note on the oversize term.** The prompts already truncate: `CLASSIFY_BODY_CHARS` is
4000 and `EXTRACT_TEXT_CHARS` is 12000, so a 2 MB body does not turn into 2 MB of prompt. The
oversize term is not pricing tokens, it is pricing the bandwidth, the object storage and the
doc-extract CPU that a huge attachment costs before any prompt is built. The dominant term is and
should be the attachment count, because that is what multiplies model calls.

## 3. The standing bracket: who has earned what

The user's requirement was that a sender who has interacted continuously and grown gradually is
treated differently from a spike. The mechanism is that **standing is earned by distinct active
days, never by volume.** You cannot buy allowance by sending more. You can only earn it by having
existed, and sent something, on more separate days.

From `core.gate_activity`, two integers per principal: `daysSeen` (distinct days with at least one
email) and `ageDays` (days since the first). Then, in order, first match wins:

| standing      | condition                          | burst units | daily units |
|---------------|------------------------------------|-------------|-------------|
| `blocked`     | a person set policy `block`        | 0           | 0           |
| `trusted`     | a person set policy `allow`        | 600         | 20000       |
| `established` | `daysSeen >= 10 and ageDays >= 30` | 300         | 6000        |
| `regular`     | `daysSeen >= 3 and ageDays >= 7`   | 120         | 1200        |
| `new`         | `daysSeen >= 1`                    | 45          | 300         |
| `unknown`     | nothing has ever arrived from it   | 20          | 60          |

A flood on day one is `unknown`: 20 units of burst, which is exactly one ordinary email with two
documents and not two of them, and 60 units in a day. A domain that has been mailing us for two months is `established` and can
send 6000 units a day without anyone doing anything. Nothing in between can be skipped, because the
conditions are on days and days pass at one rate.

## 4. The growth clamp

Standing alone still lets an established sender go from 40 units a day to 6000 overnight, which is
what a compromised account looks like. So the daily cap is additionally clamped to the sender's own
recent behaviour:

```
dailyCap = min(standingDaily, max(NEW_DAILY, GROWTH_FACTOR * median(last 14 daily totals)))
GROWTH_FACTOR = 3
NEW_DAILY     = 300     the clamp can never take a sender below a newcomer's allowance
```

The median is over 14 integers including the zero days, which makes it pure, cheap and stable
against one quiet week. It applies to `regular` and `established` only: `new` has no baseline worth
having and `trusted` is a person's explicit decision, which the arithmetic does not get to second
guess.

So a sender may roughly triple its normal day without anyone noticing, and the day after that
tripling becomes the new normal it may triple again. That is gradual growth, and it is a ladder a
spike cannot climb in one step.

## 5. Three scopes at once

This is the multi-parameter part. Every email is charged against three buckets, and every one of
them must have room:

| scope     | principal                       | why it is there                                       |
|-----------|---------------------------------|-------------------------------------------------------|
| `address` | the full lowercased sender      | the narrowest thing we can name                        |
| `domain`  | `senderDomain(from)`            | catches an attacker rotating the local part            |
| `global`  | the literal string `global`     | catches an attacker rotating domains                   |

`global` carries its own fixed numbers rather than a standing: `GATE_GLOBAL_BURST` (default 4000)
and `GATE_GLOBAL_DAILY` (default 60000). The verdict names which scope refused and by how much, so
the page can say "the domain's one-minute burst, 118 of 120 used" rather than showing a score.

## 6. The global budget breaker

The real guarantee about the bill, and the only part that does not depend on believing a `From`
header. `core.llm_calls` already records `cost_usd` per call. A scheduler task every five minutes
sums today's and writes it to Redis. Then, deterministically:

| spend / `GATE_DAILY_BUDGET_USD` | effect                                             |
|----------------------------------|----------------------------------------------------|
| below 0.8                        | nothing                                            |
| 0.8 and above                    | `unknown` and `new` are held                       |
| 1.0 and above                    | only `trusted` and `established` are admitted      |

It degrades by standing rather than switching everything off, because an attacker whose flood
stops your real customers has achieved the outage they wanted.

## 7. Modes, and why the default does not bite

`GATE_MODE` is `off`, `observe` or `enforce`, default **`observe`**.

In `observe` the gate computes every verdict, charges every bucket and writes every decision row,
and then admits the email anyway. The page shows what it would have held. This is not timidity, it
is the only responsible way to deploy a rate limiter: you look at what it would have done to real
traffic before you let it do it. It also keeps the Averis replay working, where 520 emails from
fifteen domains are all `unknown` on the first day and a live gate would hold most of the demo.

One thing bites in every mode except `off`: **a policy a person set.** A domain someone blacklisted
is held in `observe` too, because that is a decision, not a guess. This is also what makes the
screen demonstrable on day one.

Buckets are charged even when the verdict is `hold`, in every mode. A refused email still cost the
ingest work, charging it keeps a flood's bucket empty instead of handing an attacker a free retry
at exactly the limit, and it means the numbers `observe` shows are the numbers `enforce` would have
seen.

## 8. When Redis is away

The priority cache fails open to the default tier, because an email must still be queued. A gate
cannot copy that reasoning wholesale: failing open is the attacker's best case. It also cannot fail
closed, because a Redis restart would then stop the pipeline.

So it fails to what it already knew. Standing comes from Postgres, not Redis, and is still
readable. With the meter unreachable:

- `regular`, `established` and `trusted` are admitted. We trusted them a minute ago on evidence
  that has not changed.
- `unknown` and `new` are held, in `enforce` only.
- In `observe`, everything is admitted, as always.

## 9. Data

Migration `025_ingest_gate.sql`. Three new tables, no change to any existing one, which makes the
rollback story trivial: an image from before this phase never queries them.

```sql
core.gate_policy (
  principal text, scope text check (scope in ('address','domain')),
  policy text not null check (policy in ('allow','block')),
  reason text, note text, set_by text, set_at timestamptz not null default now(),
  primary key (principal, scope)
)

core.gate_activity (
  principal text, scope text, day date,
  emails int not null default 0, units int not null default 0, held int not null default 0,
  primary key (principal, scope, day)
)

core.gate_decisions (
  id bigserial primary key,
  run_id uuid references core.runs(id) on delete cascade,
  email_id text not null,
  from_addr text not null, principal text not null, scope text not null,
  decision text not null check (decision in ('admit','hold')),
  enforced boolean not null,
  reason text not null, standing text not null,
  units int not null, breakdown jsonb not null, buckets jsonb not null,
  decided_at timestamptz not null default now(),
  released_by text, released_at timestamptz
)
```

`gate_decisions` is append only; a release stamps the row rather than deleting it. There is no
foreign key to `core.emails` on `email_id`, because a decision may be recorded for an email the gate
declined to store.

**A held email gets no `core.email_runs` row.** This was the one real design fork. Giving it a row
with a new `held` stage would read better, but `Stage` is parsed as a closed enum on both sides, so
a rollback to the previous image would meet a stage value it refuses and the run page would break.
Migrations here are expand and contract, so the answer is the table nobody else reads.

The cost of that choice is that run completion has to account for holds, since `finishedEmails`
would otherwise never reach `totalEmails` and the run page would spin forever. `RunSummary` gains
`heldByGate: number`, and `processingDone` counts it. The frontend mirror defaults it to 0, so the
three minutes during which a new frontend talks to an old backend parse cleanly.

## 10. Modules

Pure core imports nothing above it, adapters do not import each other, orchestration is thin.

```
pipeline/gate/                  pure. no pg, no redis, no http, no clock it did not receive
  cost.ts        an EmailRecord -> units and their breakdown
  standing.ts    policy + daysSeen + ageDays -> a bracket and its two caps
  growth.ts      14 daily totals -> the clamped daily cap
  decide.ts      everything above + bucket readings + budget level -> a GateVerdict
  index.ts

ingest/gate/
  meter.ts       the three token buckets, one Lua script, one round trip. GateMeter interface
  __fakes__/memory.meter.ts
  gate.ts        load standing and policy, call decide, write the decision, update activity
  index.ts

ontology/repositories/
  gate-senders.repo.ts     policy and activity, and the one query that answers both scopes
  gate-decisions.repo.ts   the log, the holding pen, the release

routes/gate.routes.ts
```

`decide.ts` is the multi-parameter function the user asked for, and it is a pure function of six
numbers and two enums. Everything difficult about this feature is testable without a database.

## 11. HTTP

| method | path                          | what                                                      |
|--------|-------------------------------|-----------------------------------------------------------|
| GET    | `/gate`                       | mode, budget level, today's spend, the global buckets     |
| GET    | `/gate/senders`               | every principal seen: standing, caps, today's units, pressure, policy |
| PUT    | `/gate/senders/:principal`    | `{ scope, policy: "allow" \| "block" \| "auto", note? }`  |
| GET    | `/gate/held`                  | the holding pen, newest first                              |
| POST   | `/gate/held/:id/release`      | admit that email after all                                 |
| GET    | `/gate/decisions`             | the log, for the page's activity feed                     |

`policy: "auto"` deletes the row, which is how a blacklisted sender is whitelisted back and how a
whitelisted one returns to being judged on its record.

Release enqueues `release-email` on the ingest queue with `{runId, emailId}`, and the worker runs
`ingestEmail` with the gate bypassed. It is a job and not an inline call because releasing has to
copy attachments into object storage, which is work the api has no business doing on a request. An
older worker that met this job name would parse it as an ingest job at epoch 0 and answer
`superseded`, which is a harmless no-op.

## 12. The screen

`/traffic`, in the rail beside Clients as the second global destination. Clients is about which
sender is served first; this is about which sender is served at all, and mixing them would muddy a
page whose copy promises that a tier decides nothing else.

Two panes under one header.

**The header** says the mode in words, and draws the day's budget as one bar: spend against
`GATE_DAILY_BUDGET_USD`, with the two thresholds marked. In `observe` it says, plainly, that
nothing is being held except what a person blocked.

**Senders.** One row per principal, busiest first: the address or domain, its standing with the
reason it has that standing (`seen on 4 days since 12 Aug`), today's units against its clamped daily
cap as a bar, its burst pressure, how many of its emails were held, and one control with three
positions: `auto`, `allow`, `block`. Writing is the same pattern as the clients page, write on
change with a toast, no save button.

**Held.** The holding pen: the email, who it claimed to be from, the verdict in a sentence the row
can actually justify (`the domain's daily cap, 302 of 300 units`), what it would have cost, when,
and a Release button. Empty most of the time, and it says so.

Both poll with SWR, like every other live surface. The header's numbers move while a burst run is
going, which is the point: the user asked to see what it is doing.

## 13. Config

| var | default | what |
|---|---|---|
| `GATE_MODE` | `observe` | `off`, `observe`, `enforce` |
| `GATE_DAILY_BUDGET_USD` | `25` | what a day may cost before the breaker degrades |
| `GATE_GLOBAL_BURST` | `4000` | units in the global bucket |
| `GATE_GLOBAL_DAILY` | `60000` | units globally per day |
| `GATE_BURST_REFILL_SECONDS` | `600` | how long an empty bucket takes to refill |

Every other number in this document is a constant in `pipeline/gate/`, not an env var. They are
parameters of a policy, not of a deployment, and a policy that can be changed in fifteen places is
not a policy.

## 14. Tests

- Table-driven and pure: `cost`, `standing`, `growth`, `decide`. Every bracket boundary, every
  scope refusing, the clamp floor, the budget levels, the Redis-down fallback per standing.
- `gate.ts` against `MemoryGateMeter` and a rolled-back transaction: a hold writes a decision row,
  an activity row and no attachment.
- **The test that matters:** ingest a held email end to end with a fake LLM client and assert
  `core.llm_calls` gained no row and object storage received no put.
- Repository tests in a transaction: policy upsert and delete, activity upsert on conflict, the
  holding pen query, release stamping.
- Route tests: the three positions of the policy control, a release enqueueing exactly one job.
- No test touches the real proxy, and none of this has a prompt.

## 15. Exit checklist

- [ ] `pnpm type-check` and `pnpm test` green in `backend/`, `pnpm type-check` green in `frontend/`.
- [ ] A held email leaves `core.llm_calls` untouched, proven by a test.
- [ ] Four pure modules, each with a table-driven test covering its boundaries.
- [ ] `GATE_MODE=observe` on a full replay holds nothing and records a verdict for every email.
- [ ] `GATE_MODE=enforce` on a synthetic burst from one unknown domain holds the overflow and
      admits the first emails.
- [ ] Blacklisting a domain on `/traffic` holds its next email in `observe` mode; setting it back to
      `auto` admits again.
- [ ] Releasing a held email runs it through the pipeline to a verdict.
- [ ] `03-infra-deep.md` carries the three tables, the six routes and `RunSummary.heldByGate`.
- [ ] `PROGRESS.md` updated, phase merged to `main`.

## 16. Deliberately not built

No per-IP anything, the pipeline never sees one. No content heuristics. No machine learning, the
user asked for determinism and was right to. No new queue and no new service: the gate is a
function call on a path that already exists. No auto-blacklist, for the reason in the threat model.
No quarantine expiry or auto-purge; nothing here deletes mail, and if the holding pen needs a
retention policy that is a later phase with a migration of its own.
