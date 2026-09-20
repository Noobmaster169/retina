# Phase 10f: The semantic layer (built)

**Built on 2026-09-21 and merged to `main`.** It was parked on 2026-09-20 and unparked by the
user, who also settled the two decisions section "Decisions the user has to make" leaves open.
`docs/phases/phase-10f-handover.md` section 6 is the re-reading against 10d and 10e that the
old header asked for, and it is still worth reading first.

## What the repo does that this file did not say

`CLAUDE.md` rule 5: where a design doc and the repo disagree, the repo wins for what is built and
the doc is corrected. These are the corrections.

- **Migrations.** `016` was taken by 10e. The layer is `017_semantic_expand.sql`,
  `018_semantic_tables.sql`, `019_concept_backfill.sql` (the `backfill_wanted` flag),
  `020_entity_name_lookup.sql`, `021_entities_ranked.sql` and `022_entity_names_knn.sql`. The last
  three are indexes `pnpm ontology:bench` asked for; see "What the bench found" below.
- **Prompts.** The chat prompt is `chat/v4`, not `v3`, and `CHAT.md` went to v3, not v2.
- **`joinSql` does carry a literal**, or it would: `verdict = 'yes'` is a string literal and 10d's
  guard would have refused it. `concept_verdicts.matched` is a stored generated column equal to
  `verdict = 'yes'`, so the subquery is `... and matched` and carries no literal at all.
- **A turn's readings are on `ChatTurn`, not on `ChatAnswer`.** The thread is read back after a
  reload, and a total stated as a lower bound has to still read as one.
- **The survivor of a merge is the entity with more mentions**, with the cluster's most-seen
  spelling as the tiebreak. Work item 1 states both rules and they can disagree; the mention count
  wins, because what a kept id buys is the profile and the verdicts written against it and those
  describe the evidence, not the spelling.
- **`reconcile` has a fourth output, `drop`**: an entity no cluster claims any more has lost every
  spelling it held, so it is deleted with its profile and its verdicts. Without it the table grows
  monotonically with things a deleted run left behind.
- **`resolveEntities` takes sightings**, a third argument of spellings with no extraction field
  behind them. Without it a party named only in an SI request's prose forms no cluster, and
  `reconcile` would drop it on the next pass.
- **Ranking is two queries, not one `order by ts_rank`.** See "What the bench found".
- **`refresh-profiles` and `backfill-concepts` are scheduled tasks, not a `concept-backfill`
  queue.** One queue was enough; `core.concepts.backfill_wanted` says which concept is worth
  finishing, which is what `needComplete` and a second asking write.

## What the bench found

`pnpm ontology:bench` at 200,000 things and 2,000,000 sightings, on the development box:

- One full `resolveAll`: 6.0 s to load, 2.6 s to resolve and plan. **The incremental form stays
  Deferred**, with that number as its reason: a pass every five minutes at nine seconds is not
  the thing to fix, and at a million things it would still be under a minute.
- It found three missing indexes, which is what it is for. The exact-spelling lookup was a
  sequential scan (`020`), topping the candidate list up was a sequential scan and a top-N sort
  (`021`), and the candidate search was 760 ms because a similarity threshold of 0.3 matched a
  tenth of the table. `022` replaces that threshold with a nearest-neighbour search on a GiST
  index, which stops after fifty rows at any size: a tool that shows eight candidates wants the
  nearest few, not everything over a line.

Written 2026-09-20 for the engineer who builds it, against the code on
`phase-10-analytics-and-chat`. Read `CLAUDE.md`, then `phase-10-handover.md`, then
`phase-10d-chat-harness.md` and `phase-10e-interactive-chat.md`, then this. **10d and 10e are built first.** Every rule in `CLAUDE.md`
applies unchanged: the model reads and judges, code assembles and validates, prompts are files,
every call goes through `agents/structured.ts`, all SQL lives in repositories.

## Goal

The chat agent can answer a question whose terms are written nowhere in the database. "Ports in
Asia", "customers that are distributors", "who handles the Gulf accounts", "food packaging
shipments since January": none of these words is a column value. 10d made the agent look at the
names that exist; this phase gives those names meaning. It turns such a term into a set of
entity ids that SQL can join on, and keeps doing so in bounded time when the mailbox grows from
520 emails to millions and the party list from 20 to 200,000.

One sentence of design: **knowledge lives on entities, never on emails; emails are only ever
filtered by indexed SQL; the model judges a bounded number of entity profiles per question and
every verdict is kept, so a question asked twice is a lookup.**

## Prerequisites

`phase-10-analytics-and-chat` and 10d merged. This phase extends what they built and replaces
none of it:

| Built already | Where | What this phase does with it |
|---|---|---|
| `core.entities`, `core.entity_names`, `core.entity_mentions` (migration 013) | ports and parties resolved from five of the seven fields | adds columns to `entities`, adds kinds, leaves `entity_mentions` exactly as it is |
| `pipeline/ontology/resolve.ts` | union-find over the field judge's `same` verdicts; the only thing that joins two spellings | keeps it; adds a second source of joins and makes ids survive a refresh |
| `entities.replaceAll` | deletes every entity and reinserts, every refresh | replaced by a reconcile that keeps ids. **Nothing in this phase works until this is done** |
| `find_entity`, `get_entity`, the plan step, skills, the literal guard (10d) | the chat harness | `find_entity` and `get_entity` are extended; one tool and one skill are added; `meaning` terms get wired |
| `search_emails` (10d) | full-text over subject and body | serves class I below; nothing to build |

## What the mail actually holds

Read from `email_001` to `email_050` and their attachments, and from the generator's pools (for
sizes only). `ground_truth.json` was not opened and is not needed by anything in this phase.

1. **An email has no date.** The record is `email_id, from, subject, body, attachments`. Dates
   exist only inside text: a subject suffix (`28-Jan-26`, `15_01_2026`), a forwarded header
   (`Sent: Friday, December 15, 2026 7:50 AM`). `core.emails.first_seen_at` is when we ingested
   it. Any "in the last few months" question depends on which of these is used, so the layer
   stores both and the agent says which one it filtered on.
2. **The documents carry more than the seven fields.** Every text SI and BL also states some of:
   vessel, voyage, goods description, HS code, booking reference, OC number, BL number, freight
   terms, container type (`1 x 40'HC`). None of it is stored today.
3. **An SI_REQUEST body is a whole shipment in prose.** `email_007`: POL, POD, shipper with
   an "on behalf of" line and address, consignee and notify party with addresses, container
   count and type, goods, HS code, gross weight, trade term, documents required. 125 of 520
   emails are this category and none has an attachment, so an ontology fed from documents
   alone misses a quarter of the mailbox.
4. **Subjects are coded.** Selling entity (`AFEMY`, `AIE`, `AFRT`, `AFPTME`), discharge port,
   carrier and BL number (`CMA(SIJ4216073)`), OC number, invoice number, customer, payment term
   (`OA`, `DP`, `LC`, `OA_CFR`), BL type (`OBL`, `SWB`, `SURR BL`, `HOUSE BL`), PO number,
   tonnage. The model reads these; no parser is written for them.
5. **A party sometimes has an address and sometimes does not.** Of 72 party lines in the first
   50 emails' text documents, 48 are followed by an address line and 24 are a name alone. The
   same company appears both ways, and an address may carry a phone or a tax number
   (`GST NO - 33AACFN6792L1ZU`). So an address belongs to the sighting, not to the company.
6. **One company plays several roles.** `UAB NOVAKOPA` is a notify party in one email and a
   consignee in another; `VITAL SOLUTIONS PTE LTD` is a sender domain, a notify party, and the
   principal behind an "on behalf of" shipper line. Role belongs to the sighting too.
7. **Sender and signature disagree.** `email_001` comes from `aziztz@safqa.co.ke` and is signed
   "Willy Situmorang, APRIL Fine Paper Trading (Middle East) Fze". Forwarded headers give clean
   `Name <address>` pairs. A person is therefore built from separate sightings (sent, signed,
   addressed) and two sightings are joined only when the model says so with a quote.
8. **The BL side can be wrong by design.** About half the pairs carry an injected mismatch, so a
   BL's port of discharge may be a port the shipment never goes to. A sighting on a field the
   judge called different is marked disputed and the shipment takes the SI side (or the
   reviewer's correction).
9. **Everything here is paper.** Seven commodities, all HS chapter 48. A question about
   semiconductors has the correct answer "none of the companies we see, and here is what they
   do ship". The layer must be able to say that, which means telling "no" from "unknown".
10. **This seed is tiny and randomly paired.** 20 customers, 4 shippers, 32 ports, 9 carriers,
    12 staff. A consignee in Seoul ships to Callao because the generator draws independently.
    Do not build on, or validate against, relationships between drawn values (a consignee's
    country matching the discharge port, a carrier matching a lane). Design for the scaled
    case; this inbox only proves the mechanism.

## The questions this must serve

Every question the agent gets is a mix of these classes. 10d's plan step already names each term's kind; this table is what each kind then needs. The build is driven by the table: each
class names the part of the layer that answers it. "SQL" means 10a's `run_sql` alone.

| # | Class | Example prompts | What answers it |
|---|---|---|---|
| A | Already a column | "How many mismatches in the latest run?", "Which client has the most reviews?" | SQL. No semantic layer |
| B | Stated in the mail, not stored yet | "Shipments on LE HAVRE V.QI540A", "Everything under HS 4810", "Which BLs are telex release?", "CFR shipments over 100 tonnes", "What did PO 26067 contain?" | `shipment-read` fills `email_shipments`; then SQL |
| C | A place term | "Ports in Asia", "Gulf consignees", "EU destinations", "West African lanes", "Landlocked customers' countries" | Standard attributes on the entity (region, subregion, country) for the common ones; a concept verdict for the rest |
| D | What a company is | "Which customers are distributors and which are converters?", "Stationery companies", "Anyone in semiconductors?", "Freight forwarders that email us" | Entity profile plus concept verdict |
| E | What the goods are | "Food grade board", "Office paper against packaging board", "Coated grades" | Commodity entities with profiles; concept verdict |
| F | Names and identity | "Al Gurg", "Topkopy", "BDP", "All the APRIL companies", "Is Roxcel the same as Roxcel Trading GmbH?" | 10d's `find_entity` over every spelling; group membership is a concept |
| G | Roles | "Who acts as notify party for other consignees?", "Companies that are both consignee and notify party" | `core.entity_appearances.role`; SQL |
| H | Time | "In the last few months", "Since January", "Before the holiday notice" | `mail_date` with `first_seen_at` as fallback; today's date in the chat prompt; the answer names the date column used |
| I | What an email talks about | "Emails chasing detention charges", "Who is asking for a telex release?", "Urgent amendment requests" | Narrow by SQL (category, date, entity), then 10d's `search_emails` |
| J | Links between things | "Which carriers take our cargo to East Africa?", "Customers that share a notify party", "Busiest lanes" | Joins over `email_shipments` and mentions, with C for the place term |
| K | A total over a fuzzy group | "Tonnage to Asia by month", "Mismatch rate by region", "Container count for distributors" | The group must be complete, so C's attributes or a concept with `complete: true`; otherwise the answer is stated as a lower bound |
| L | Underspecified | "Our big customers", "Problem ports", "Risky shipments" | The agent states how it read the term (big = gross weight, problem = mismatch rate) before the number, or asks one question |
| M | Nothing there | "Semiconductor shippers", "Cold chain cargo" | `find_entities` returns no matches with coverage: judged N of N, M unknown |
| N | Not in any mail | "Is Mombasa congested this week?", "Is this consignee sanctioned?" | Out of scope. The agent says the layer holds what the mail shows and, where allowed, general knowledge with no date on it |
| O | People | "Who handles Roxcel?", "Which staff deal with invoice queries?", "Who at Fujito writes to us?" | Person entities from sent, signed and addressed sightings; SQL over mentions and categories |
| P | After a human correction | "Shipments to Busan" after a reviewer fixed a port | The ontology job re-runs for that email on a review action; shipments prefer `human_value` |
| Q | Ambiguous names | "Singapore" (port, country, or company address), "ONE" (the carrier), "Mersin" | 10d's typed candidates and its clarifying answer; more kinds here make it matter more |
| R | Another language | "亚洲的港口", labels with Chinese glosses | Nothing special: the model reads, profiles are in English |
| S | Sizes and units | "Heavy shipments", "More than 5 containers", "20 foot against 40 foot" | Numeric columns on `email_shipments`, written by the model and validated by zod |

Two things follow from the table. First, more than half the classes (A, B, G, H, J, O, S) need no
semantic step once the mail's stated facts are stored, so storing them is the larger half of the
work. Second, only C, D, E, part of F, K and M need the concept machinery, and they all run on
entities.

## Scope

In: stable entity ids, four new entity kinds, sightings from subjects and bodies, a shipment row
per email, profiles with standard attributes, concepts and verdicts, five LLM steps, one queue,
one scheduled job, one new chat tool and two extended, the `meaning-terms` skill, prompt
`chat/v3`, a question set, a scale check.

Out: embeddings and any vector index (see Deferred), web lookup, new ontology screens (the
built pages read the new kinds through the same routes), the Earth, any change to the scored
pipeline. Nothing here runs before an email's verdict is written, so nothing here can move the
score.

## Design decisions

1. **Rows, not files.** A profile is Markdown text in a column. A file per company cannot join
   to "shipped since January", cannot be fetched one at a time without a directory walk, and is
   a second source of truth. `pnpm ontology:export` writes the profiles out as a folder of `.md`
   for people who want to read them; nothing reads that folder back.
2. **The existing `entities` table grows; no second one.** A party, a port, a carrier, a
   person, a commodity and a vessel differ only in their standard attributes, which live in
   `attributes jsonb` under a zod schema per kind. The kind stays `party`, as built, not
   `company`.
3. **Identity has to survive a refresh.** Profiles and verdicts hang on `entity_id`, and today
   a refresh gives every entity a new id. A pure `reconcile` matches each resolved cluster to
   the entity that already holds its spellings, keeps that id, and leaves a tombstone pointing
   at the survivor when two merge.
4. **Two judges may join spellings, and the row says which.** The field judge's `same` verdict
   stays the join for values it saw side by side. A new `entity-resolve` step judges a spelling
   the field judge never saw against candidates. Both are model judgements, which is what
   `CLAUDE.md` asks for; `resolve.ts`'s ban on lowercasing, edit distance and lookup tables
   stands untouched, because similarity still only proposes candidates.
5. **Document mentions and mail sightings are two tables under one view.**
   `core.entity_mentions` is derived from `extraction_fields`, per `email_run`, and stays
   rebuildable exactly as its comment says. What the model reads in a subject or a body has no
   extraction field and belongs to the email, not a run, so it goes in `core.entity_sightings`.
   `core.entity_appearances` unions them for everything that asks "where did this thing
   appear".
6. **Address and role sit on the appearance.** The entity's country and city are written by the
   profile step from the addresses it was shown, and a profile says so when they conflict.
7. **Two knowledge sources, labelled.** A profile has an `observed` section (only what our mail
   shows) and a `general` section (what the model knows from training, marked unverified, with
   a confidence, allowed to be "nothing known"). `ONTOLOGY_KNOWLEDGE=mail|mail+model` in
   `config.ts` turns the second off. Default `mail+model`: a port's region is general knowledge
   and nobody should have to see the word "Asia" in an email before the question works.
   **This default is the user's to confirm.**
8. **Judging is bounded per question, and the bound is visible.** `find_entities` judges at most
   `JUDGE_BUDGET` profiles in one turn. Below the budget the answer is exhaustive. Above it the
   tool ranks, judges the best, says `complete: false` with the number left unjudged, and queues
   the rest in the background. An answer never looks complete when it is not.
9. **Verdicts are kept and go stale honestly.** A verdict is stored against the profile version
   it read. A rewritten profile makes it stale; the next question re-judges that one entity.
10. **A separate queue.** The work is per email, must survive a restart, and must never fail or
    slow a scored email, so it cannot ride the `compare` job. It takes the LLM semaphore at the
    lowest priority.
11. **Expand, then use.** Widening a check constraint is safe for the database and not for the
    image a rollback restores: its zod enums do not know `carrier`. Migration 016 widens the
    checks and ships with code that reads the new values; the code that writes them ships in a
    later commit, after 016's image has deployed cleanly.

## Work items

Check `ls backend/db/migrations/` before naming a file. 10d took 015; the numbers below assume
016 and 017 are free.

### 1. Stable ids: `pipeline/ontology/reconcile.ts` and the end of `replaceAll`

Pure, table-driven test. Input: the resolved clusters (from `resolveEntities`, unchanged) and
the existing entities with their spellings. Output: `{ keep: [{ id, cluster }], insert:
[cluster], merge: [{ from, into }] }`.

- A cluster keeps the id of the existing entity that holds its most-seen spelling.
- When a cluster holds spellings of two existing entities, the one with more mentions survives;
  the other gets `merged_into` and keeps its row, so a stored verdict or a remembered grounding
  can follow it. A merged entity is marked stale.
- A split (a human or a later verdict separates spellings) keeps the id with the larger part.

`entities.replaceAll` becomes `entities.applyResolution(tx, plan)`: update kept rows, replace
their names and mentions, insert new ones, set tombstones. On a merge, the same transaction
repoints the merged entity's sightings and shipment columns to the survivor and deletes its
concept verdicts, which were judged on a profile that no longer describes anything. Every read of `core.entities` gains
`where merged_into is null` (the built repository has about six; grep for `from core.entities`).

The refresh still recomputes everything, which reads every mention into memory. That is fine
to tens of thousands of emails and not beyond. The incremental form is the same pure function
over a subgraph: load only the entities whose spellings include one of this email's spellings,
resolve, reconcile. Build the full form first, measure it in `ontology:bench` (work item 11),
and build the incremental one in this phase only if the bench says the full one is already too
slow at 200,000 entities; otherwise record it under Deferred with the number.

### 2. Migrations `016_semantic_expand.sql` and `017_semantic_tables.sql`

```sql
-- 016: only widens and adds. Ships with code that reads the new values and writes none.
alter table core.entities drop constraint entities_kind_check;
alter table core.entities add constraint entities_kind_check
  check (kind in ('port','party','carrier','person','commodity','vessel'));

alter table core.entities
  add column merged_into        bigint references core.entities(id),
  add column attributes         jsonb not null default '{}'::jsonb,
  add column attributes_source  jsonb not null default '{}'::jsonb,
  add column profile_md         text,
  add column profile_version    int not null default 0,
  add column profile_updated_at timestamptz,
  add column stale              boolean not null default true,
  add column search_text        text not null default '',
  add column search             tsvector generated always as (to_tsvector('simple', search_text)) stored;
create index entities_search on core.entities using gin (search);
create index entities_region on core.entities (kind, (attributes->>'region')) where merged_into is null;
create index entities_country on core.entities (kind, (attributes->>'country')) where merged_into is null;
create index entities_stale on core.entities (profile_updated_at nulls first) where stale and merged_into is null;

-- Which judge joined a spelling. joined_by stays kept | judge | human, so the older image still parses it.
alter table core.entity_names add column joined_step text;
```

Confirm the constraint's real name with `\d core.entities` before writing the drop.

```sql
-- 017
create table core.entity_sightings (
  id            bigserial primary key,
  entity_id     bigint not null references core.entities(id) on delete cascade,
  email_id      text not null references core.emails(email_id),
  email_run_id  bigint references core.email_runs(id) on delete set null,
  role          text not null check (role in ('shipper','on_behalf_of','consignee','notify_party',
                  'port_of_loading','port_of_discharge','carrier','vessel','commodity',
                  'sender','signer','addressee','mentioned')),
  source        text not null check (source in ('subject','body','header','document')),
  surface       text not null,
  address       text,
  source_quote  text not null,
  ambiguous     boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (email_id, role, source, entity_id)
);
create index on core.entity_sightings (entity_id, role);
create index on core.entity_sightings (email_id);

create view core.entity_appearances as
  select m.entity_id, er.email_id, m.email_run_id, m.field as role, 'document_field' as source,
         m.value as surface, null::text as address,
         exists (select 1 from core.field_diffs fd
                   join core.comparisons c on c.id = fd.comparison_id
                  where c.email_run_id = m.email_run_id and fd.field = m.field
                    and not fd.same and not fd.missing and fd.bl_value = m.value) as disputed
    from core.entity_mentions m
    join core.email_runs er on er.id = m.email_run_id
  union all
  select s.entity_id, s.email_id, s.email_run_id, s.role, s.source, s.surface, s.address, false
    from core.entity_sightings s;

create table core.email_shipments (
  email_id         text primary key references core.emails(email_id),
  email_run_id     bigint references core.email_runs(id),
  oc_no            text, bl_no text, booking_ref text, invoice_no text, po_no text,
  shipper_id       bigint references core.entities(id),
  consignee_id     bigint references core.entities(id),
  notify_party_id  bigint references core.entities(id),
  pol_id           bigint references core.entities(id),
  pod_id           bigint references core.entities(id),
  carrier_id       bigint references core.entities(id),
  vessel_id        bigint references core.entities(id),
  commodity_id     bigint references core.entities(id),
  voyage           text, hs_code text,
  container_count  int, container_type text, gross_weight_kg numeric,
  trade_term text, payment_term text, bl_type text, freight text,
  mail_date        date,
  mail_date_quote  text,
  disputed_fields  text[] not null default '{}',
  attributes       jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);
create index on core.email_shipments (mail_date);
create index on core.email_shipments (oc_no);
create index on core.email_shipments (pod_id);
create index on core.email_shipments (consignee_id);

create table core.concepts (
  id           bigserial primary key,
  entity_kind  text not null,
  phrase       text not null,
  definition   text not null,
  search_terms text[] not null default '{}',
  asked_count  int not null default 1,
  created_at   timestamptz not null default now()
);
create index on core.concepts using gin (phrase gin_trgm_ops);

create table core.concept_verdicts (
  concept_id      bigint not null references core.concepts(id),
  entity_id       bigint not null references core.entities(id),
  verdict         text not null check (verdict in ('yes','no','unknown')),
  confidence      numeric not null,
  rationale       text not null,
  profile_version int not null,
  llm_call_id     bigint,
  decided_at      timestamptz not null default now(),
  primary key (concept_id, entity_id)
);
create index on core.concept_verdicts (concept_id, verdict);
```

`migrations/014` set default privileges, so `retina_ro` reads the new tables and the view with
no further grant; assert it in the repository test all the same. `disputed` is how a port that
exists only on a wrong draft BL stays out of "shipments to Busan": questions about where cargo
went filter `not disputed`. `attributes_source` mirrors the attribute keys: `{ "region":
{ "source": "model", "confidence": 0.98, "llmCallId": 812 } }`. Anything the mail states about
a shipment that has no column goes in `email_shipments.attributes`.

Repositories, one per aggregate: `entities.repo.ts` and its siblings as built, plus
`sightings.repo.ts`, `email-shipments.repo.ts`, `concepts.repo.ts`. Split any that pass 200
lines the way `entities.detail.ts` was split.

### 3. Step `shipment-read`: the mail's stated facts

`agents/prompts/shipment-read/v1.md`, one call per email whose final category is
`BL_COMPARISON`, `SI_REQUEST` or `INVOICE_QUERY`. `GENERAL` gets a reduced reading (people,
vessel, date); `SPAM` gets none.

Input: subject, body, and for each document already parsed its text from MinIO `text/` and its
resolved role. Output schema (every value optional, every present value with a `source_quote`
and the `source` it came from):

- references: OC number, BL number, booking reference, invoice number, PO number
- parties: `{ role, name, address | null }` for shipper, on behalf of, consignee, notify party
- ports: loading and discharge, as written
- carrier, vessel, voyage, goods description, HS code
- `container_count` (integer), `container_type`, `gross_weight_kg` (number)
- trade term, payment term, BL type, freight
- `mail_date` (ISO date) with the quote it was read from, null when the email states none
- people: `{ sighting: sender | signer | addressee, name | null, email | null, company | null, title | null }`

The prompt describes the task from the brief's domain primer (what an SI and a BL are, what
each reference is for). It names no label, code or company from the inbox; `registry.test.ts`
gains this step in its inbox-phrase check. The evidence check from
`pipeline/compare/evidence.ts` runs on every quote before anything is stored; a value whose
quote is not in the text is dropped and logged, not stored and not retried (this is not a
scored field and a second call is not worth it).

Parties and ports that `extraction_fields` already holds are not sighted a second time from
the documents: `entity_mentions` has them. This step adds what only the subject, the body and
the rest of the document state. Where a seven-field value already exists in `extraction_fields`, that value (its `human_value`
when a reviewer set one) wins over this step's reading, and a field the judge called different
lands in `disputed_fields` and the shipment row takes the SI side; the view above already
marks the BL-side mention disputed.

### 4. Step `entity-resolve`: a spelling the field judge never saw

The field judge joins `MOMBASA, KENYA (KEMBA)` on an SI to `MOMBASA, KENYA` on its BL. Nothing
joins the `MOMBASA_KENYA` of a subject line, or the consignee named in an SI request's prose,
to either. That is this step. `pipeline/ontology/resolve-sighting.ts` is pure and plans; the
processor carries it out.

```
for each (kind, surface, address) that shipment-read returned:
  hit = entity_names where value = $surface, or lower(value) = lower($surface), and kind = $kind
  if exactly one live entity: use it, no model call
  else:
    candidates = 10d's find_entity query for (surface, kind), top 8, plus any hit
    answer = callStructured(entity-resolve, { surface, address, role, candidates with their
             spellings, addresses seen and profile summary })
    answer is { sameAs: entityId | null, ambiguous: boolean, rationale, confidence }
    sameAs null -> insert entity (stale), first name joined_by 'kept'
    sameAs id   -> insert name joined_by 'judge', joined_step 'entity-resolve', confidence
```

An exact or same-case hit is a cache of a judgement already made, not a rule: it only ever
reuses a spelling some judge accepted. Steady state costs nothing, because a mailbox repeats
its names. `ambiguous: true` is stored on the sighting and shown; the resolver never hides a
guess. People resolve by email address when one is present, by name otherwise, and a signer is
joined to a sender only when the model cites the header or the address that ties them. Names
added here are input to the next `resolveEntities` pass as extra `same` edges
(`Verdict`-shaped, from `entity_names where joined_step = 'entity-resolve'`), so the two
sources of joins cannot disagree about which cluster a spelling is in.

### 5. Step `entity-profile`: what an entity is

`agents/prompts/entity-profile/v1.md`, one call per stale entity. Input is a dossier of fixed
size whatever the entity's traffic, assembled by `pipeline/ontology/dossier.ts` from repository
reads: spellings with counts and how each joined, role counts, the ten most frequent counterparties, lanes and goods,
first and last `mail_date`, the distinct addresses seen (up to ten), and the twenty most recent
quotes. Output:

```ts
{ summary: string,            // two sentences, what a reader should know first
  observed: string,           // only what the dossier shows
  general: string | null,     // model knowledge, unverified; null when nothing is known or the source is off
  generalConfidence: number | null,
  attributes: PortAttributes | PartyAttributes | ...,   // by type, every key nullable
  unknowns: string[] }
```

Standard attributes, one zod schema per kind in `contracts.ontology.ts`:

| Type | Attributes |
|---|---|
| port | `country`, `region`, `subregion`, `locode`, `coast` |
| party | `country`, `city`, `kind` (what it does in the trade, free text under 40 chars), `sector`, `group` |
| carrier | `fullName`, `scac`, `kind` |
| commodity | `family`, `hsChapter`, `use` |
| person | `company`, `title`, `team` |
| vessel | `operator` |

`region` and `subregion` are closed enums (the UN geoscheme's names), because totals are asked
over them and a closed set keeps them complete; everything else is free text. The model assigns
them; there is no country-to-region table in code. `profile_md` is rendered from the output by
a pure function, `profile_version` rises by one, `search_text` becomes the canonical name,
spellings, summary, observed, general and attribute values, and `stale` clears.

Refresh is a repeatable job on phase 9's scheduler queue, `refresh-profiles`, every 10 minutes:
take up to `PROFILE_BATCH` (50) stale entities, never-profiled first, then oldest, skipping any
profiled in the last 24 hours. A new mention sets `stale`. Cost follows the day's new mail, not
the size of the table: an entity nobody wrote about is never rewritten.

### 6. Queue `ontology`

`queues/names.ts` gains `ontology` with payload `{ emailId, emailRunId }` and job id `emailId`
(a second enqueue while one waits is a no-op). Enqueued after the row write when an email
reaches `done` or `review`, and again by `review/rerun.ts` when a correction changes a value.
The processor: load, `shipment-read` (reused from `llmCalls.latestAccepted` on a retry, as
every step is), resolve each sighting, write the sightings and the shipment row in one
transaction replacing that email's previous ones, mark touched entities stale. Outages pause
the queue through `pausingOnOutage`; a terminal failure is logged on the job and leaves the
email's verdict untouched. No `email_runs.stage` value is added. Mind the two traps in
`phase-10-handover.md` section 7 about `opts.priority` and priority 0 when setting this
queue's priority.

`refresh-profiles` is one more entry in `SCHEDULED` and one branch in `runTask`
(`queues/schedulers.ts`), beside `refresh-analytics`. Pass `queueName` and `aging` in its test,
as the handover's section 3 says.

`pnpm ontology:backfill [--limit N]` enqueues every finished email with no `email_shipments`
row. Development runs stay at 20 to 30 emails; the full backfill is the user's to start.

### 7. Concepts: `concept-define` and `concept-judge`

`concept-define/v1.md`: given the user's phrase, the entity kind, and up to five existing
concepts fetched by trigram on `phrase`, answer `{ sameAs: conceptId | null, definition,
searchTerms: string[] }`. The definition is one paragraph that a second reader could apply
("a seaport located in Asia by the UN geoscheme, including Western Asia"), and it is shown to
the user, so a disagreement about what "Asia" covers surfaces in the answer instead of in the
numbers. `searchTerms` are the words a matching profile would likely contain; they rank, they
never decide.

`concept-judge/v1.md`: given the definition and a batch of `JUDGE_BATCH` (40) entities, each as
id, name, attributes, summary, observed and general, answer per id `{ verdict: yes | no |
unknown, confidence, rationale }`. The schema is built per call from exactly the ids sent, as
the field judge's is, so the model can neither skip one nor answer for one it was not given.
`unknown` is what the prompt asks for when the profile gives no basis; "no" needs a basis too.

`pipeline/ontology/plan-judging.ts` (pure): given candidate ids, existing verdicts with their
profile versions, current profile versions, a rank order and the budget, return `{ reuse,
judgeNow, deferred }`.

### 8. Chat tools and the skill

| Tool | Change |
|---|---|
| `find_entity` (10d) | covers the four new kinds; a candidate row gains the profile's two-sentence summary, so the agent can tell two similar names apart by what they are |
| `get_entity` (10d) | gains attributes with their sources, the profile, and appearances by role from `core.entity_appearances` |
| `find_entities` (new) | `{ kind, description, candidateSql?, needComplete? }`, below |

`find_entities`:

1. Define or reuse the concept; `asked_count + 1`.
2. Candidates: every live entity of the kind, or the ids returned by `candidateSql`, a select of
   one bigint column checked by `guardSql` and 10d's literal guard, run on `roPool` with a cap
   of `CANDIDATE_CAP` (5000) instead of 200. This is how "shipped in the last three months"
   narrows 200,000 parties before any profile is read, and why ids never pass through the
   model's context.
3. Plan with `plan-judging.ts`: reuse fresh verdicts; rank the rest by `ts_rank` of
   `entities.search` against the concept's search terms; judge up to `JUDGE_BUDGET` (400) now,
   in batches, in parallel under the LLM semaphore.
4. If anything is deferred, enqueue `concept-backfill` for the rest when `needComplete` is set
   or the concept has been asked before. One-off concepts are not backfilled.
5. Return `{ conceptId, definition, matches: [{ id, name, confidence, rationale }], judged,
   reused, unknown, deferred, complete, joinSql }` where `joinSql` is
   `select entity_id from core.concept_verdicts where concept_id = <id> and verdict = 'yes'`.
   The agent puts that subquery in its next `run_sql`, so the final answer is one indexed join
   however many matches there are. It contains no string literal, so 10d's guard passes it;
   add that case to `grounding.test.ts`.

Where a standard attribute answers the term (`region`, `country`, `hsChapter`), the agent
filters on it in SQL and does not call `find_entities` at all: it is complete and free.

10d's plan step already emits `meaning` terms and answers them "not supported". Here the
preflight injects the new skill for them, `agents/chat/skills/meaning-terms.md`:

- Split the question into what is a column and what is a meaning. Run the column part first and
  pass it as `candidateSql`.
- Try a standard attribute before a concept.
- State the concept's definition before the number, and the measure chosen for a word like "big".
- Say which date was filtered on, `mail_date` or `first_seen_at`, and how many rows had no
  `mail_date`. (10d's `time-questions` skill is updated to know `mail_date`.)
- A total over a concept with `complete: false` is a lower bound and is worded as one.
- "None found" and "not known" are different sentences. Report `unknown` and `deferred`.
- General knowledge is marked unverified in the answer.

`prompts/chat/v3.md` differs from v2 only in lifting v1's "do not fill a gap from general
knowledge" for what a profile's `general` section states, with that label. `schema-docs.md`
gains the view, the three tables, the new `entities` columns, and five worked examples, one per
class C, D, H, K, M. Today's date is passed in the chat input; the prompt file does not hold it.

### 9. Contract

`contracts.chat.ts`: `ChatToolName` gains `find_entities`; `ChatAnswer` gains `semantic:
[{ conceptId, phrase, definition, entityKind, matched, judged, reused, unknown, deferred,
complete }]`. `contracts.ontology.ts`: the entity kinds, the attribute schemas, the profile on
the entity detail. Mirror each as zod in `frontend/lib/api/` and write them into
`03-infra-deep.md` sections 8.1 and 11. Frontend: 10d's `reading.tsx` shows one more line per
concept (the definition, "12 of 340 matched, 3 unknown", and "partial: 1,260 not yet judged"
when incomplete); the entity record page shows the profile and attributes through the Record
tab's existing value list. No new page.

### 10. Tests

- Table-driven, pure: `reconcile.test.ts` (unchanged cluster keeps its id, a merge leaves a
  tombstone on the smaller, a split keeps the id with the larger part, a brand new cluster),
  `resolve-sighting.test.ts` (exact hit, same-case hit, no hit, two hits, person by address), `dossier.test.ts` (fixed size under a million mentions, given counts),
  `plan-judging.test.ts` (all fresh, all stale, over budget, rank order kept, empty candidates),
  profile rendering. Fixtures are real lines copied into `test/fixtures/ontology/` from
  `email_001`, `email_007`, `email_013`, `email_020`.
- Repositories against local Postgres in a rolled-back transaction: a refresh keeps every surviving entity's id, profile and verdicts; a read of
  `core.entities` never returns a merged row; a second ontology job for one email replaces its
  sightings and shipment and leaves other emails' rows alone; a verdict against an old profile version
  reads as stale.
- Processor with `FakeLlmClient`: an SI_REQUEST body becomes a shipment with four parties and
  addresses on the sightings; a quote that is not in the text drops that value only; a judged
  difference shows the BL mention disputed in the view and the shipment takes the SI side; a reviewer's
  `human_value` wins; an outage pauses; a retry reuses the stored reading.
- `find_entities` with fakes: under budget is `complete: true`; over budget defers and enqueues;
  a second identical question makes zero model calls; a rewritten profile re-judges one entity.
- `run_sql` guard reused on `candidateSql`: rejects two columns, a write, a second statement.
- Scale check, `pnpm ontology:bench`, against `retina_test` inside a transaction that is rolled
  back: insert 200,000 synthetic parties with generated profiles and 2,000,000 appearances, time
  one full `resolveAll` and record it, then assert with `explain analyze` that spelling lookup, trigram candidates, ranked candidate
  selection and the final `joinSql` join each use an index and finish under 200 ms. No model is
  called. It is not part of `pnpm test`.

### 11. Evaluation

`backend/eval/ontology-questions.json`: twenty questions, at least one per class B to S, each
with the expected entity names or the expected shape of the answer, written by a person from
the inbox and the documents. It never reads `ground_truth.json` and nothing in a prompt is
derived from it. It sits beside 10d's `chat-questions.json` and shares its runner:
`pnpm eval:chat --set ontology` runs each question through the chat loop and reports, per
question, precision and recall of the entity set, whether the completeness flag was truthful,
and calls and seconds spent. This, not impression, decides a prompt version change for the five
new steps. Few-shot examples ship only if this set shows they help.

### 12. Manual verification

On a 20 to 30 email run plus its ontology jobs:

- "Which ports in Asia did we ship to?" answers from `attributes.region` with one SQL statement
  and no `find_entities` call.
- "Which customers look like distributors rather than end users?" shows a definition, judged
  equals candidates, `complete: true`; asked again, the ledger shows no new `concept-judge` call.
- "Any semiconductor companies?" answers none, with the judged count and what the companies do
  ship.
- "SI requests since January with more than five containers" states which date column it used.
- "Who handles Roxcel?" answers from mentions, and names sender and signer separately where they
  disagree.
- A reviewer corrects a port of discharge; within a minute "shipments to" the old port no longer
  lists that email.

## How it behaves as the mailbox grows

| Entities of the asked type | Path | Model calls per new question | Complete? |
|---|---|---|---|
| up to 400 | judge every candidate | up to 10 | always |
| up to 200,000, narrowed by SQL to under 400 | same | up to 10 | always |
| up to 200,000, not narrowed | rank by search terms, judge the best 400, defer the rest | 10 now; the rest in the background only for a repeated or `needComplete` concept | flagged partial until the backfill ends |
| any size, term is a standard attribute | SQL only | 0 | always |
| any size, concept asked before | verdict lookup | 0, plus one per profile rewritten since | as it was |

Emails never enter this table. They are reached by the `(entity_id, ...)` indexes under `core.entity_appearances` and by
`email_shipments`, which is ordinary Postgres at tens of millions of rows. Ports and
carriers stay in the low thousands worldwide, so questions about them are always exhaustive;
companies and people are the types that grow.

A full concept backfill at 200,000 parties is 5,000 calls. That is why it runs only for a
concept someone asked twice or asked a total over, why the closed `region` enum exists, and why
the honest `complete: false` matters more than any ranking trick.

## Exit checklist

`[x]` was checked on a 25 email run against a live model on 2026-09-21; `[~]` is open and named.

- [x] A refresh keeps entity ids. Live: `kept: 90, inserted: 0, merged: 0, dropped: 0`, every id
      still on the same thing and 28 profiles still attached. The tombstone and the merge are held
      by `entities.resolution.test.ts`, including the swap that would abort a whole refresh.
- [x] A 20 to 30 email run fills `email_shipments` and `entity_sightings`; every stored quote was
      found in its own text; **no scored row changed**, by an md5 over every `email_runs.outcome`
      and `comparisons.status` taken before and after.
- [x] An SI_REQUEST with no attachment yields its parties with their addresses. `email_007`'s
      on-behalf-of shipper was read out of prose with its address and joined to the stored
      `VITAL SOLUTIONS PTE. LTD.` at 0.95.
- [x] A party seen with and without an address is one entity with both appearances: the address is
      on the sighting, never on the company.
- [x] Profiles: `observed` and `general` separate, the second labelled with a confidence. Live,
      after the batch reached them: 28 of 28 ports and 14 of 18 parties carry a `general` section
      (the four without are companies the model knew nothing about, which is the honest null), and
      the one person profiled carries none. The `mail` setting and the person rule are also held
      by `refresh-profiles.test.ts` over every kind and both settings.
- [~] The manual questions: "which ports in Asia" answers from `attributes->>'region'` in one SQL
      statement with no `find_entities` call, and the Gulf question ran live end to end. The other
      four want `pnpm eval:chat --set ontology`.
- [x] A repeated concept question makes no `concept-judge` call and a profile rewrite re-judges
      exactly that entity: `find-entities.test.ts`, with fakes.
- [x] Over budget the answer says partial with the deferred count and the backfill completes it:
      same file.
- [x] `pnpm ontology:bench` passes at 200,000 entities and 2,000,000 sightings, all five lookups
      indexed and inside the budget. `resolveAll` is 6.2 s to load and 2.7 s to resolve and plan,
      which is why incremental resolution stays Deferred.
- [~] **`pnpm eval:chat --set ontology` has not been run in full**, and neither has `eval:chat`.
      Both spend real tokens and both are the user's. One ontology question has been run live and
      is recorded in `PROGRESS.md`.
- [x] Expand then use: `017` only widens and adds, and the image it rolls back to reads every row
      it leaves behind.
- [x] `03-infra-deep.md`, `README.md`, `schema-docs.md` and the frontend zod mirrors are updated,
      the mirrors checked field for field against the backend contracts; type-check, tests and
      lint clean on both packages; no file this phase touched is over 200 lines. The python
      services are untouched.

## Deferred, and why

- **Embeddings.** The stack has no embedding model (the proxy is `claude -p`), and adding one is
  a new service. It earns its place when ranking by search terms demonstrably misses: the sign
  is `eval:chat --set ontology` recall falling on over-budget questions. The change is then
  one nullable
  `vector` column on `entities`, pgvector in the same Postgres, an `Embedder` seam with a fake,
  and a second ranking signal inside step 3 of `find_entities`. Profiles are embedded, never
  emails first. A separate vector database is not on any path here.
- **Incremental resolution**, if work item 1's bench says the full pass holds at the sizes we
  expect. Record the measured time and the size at which it stops being acceptable.
- **Web lookup** as a third knowledge source. It sends company names off the box; the user
  decides whether that is acceptable before anything is built.
- **`JUDGE_BUDGET` 400, `JUDGE_BATCH` 40, `CANDIDATE_CAP` 5000, `PROFILE_BATCH` 50, the 24 hour
  floor** are starting values. Measure a judge batch's latency and accuracy at 20, 40 and 80
  profiles on the ontology question set and record the choice.
- **One shipment across several emails.** `oc_no` is indexed so questions can group on it, but
  there is no `shipments` table above `email_shipments`. Add it when a question needs a
  shipment's life across its SI request, its draft and its invoice query.
- **Merging two entities a person says are one, and splitting one.** `joined_by = 'human'`
  exists and nothing writes it; it needs the action-card contract that phase 11 owns.

## Decisions the user made before the build started

1. `ONTOLOGY_KNOWLEDGE` defaults to `mail+model`. A profile's `general` section is stored with the
   label "General knowledge, unverified" and a confidence of its own, and `CHAT.md` v3 lets the
   agent repeat what it says **with that label** and never extend it. That is what reconciles it
   with v2's rule that general knowledge may relate and never report: a labelled claim about the
   world is not a claim about this mailbox.
2. A person never gets a `general` section, under either setting. `generalAllowed()` in
   `queues/refresh-profiles.ts` is the one place that decides it.
