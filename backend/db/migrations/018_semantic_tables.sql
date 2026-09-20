-- Phase 10f: what the mail states, and what the model judged about it.
--
-- Four tables and one view. Nothing here runs before an email's verdict is
-- written, so nothing here can move the score.
--
-- Additive: a rollback to 017's image leaves four tables nothing reads and a
-- queue with no consumer, which is the same shape the ontology resolver had
-- when it was first added.

-- What the model read somewhere a comparison field cannot reach: a subject, a
-- body, a forwarded header, or the part of a document that is not one of the
-- seven. It belongs to the email and not to a run, because no extraction
-- produced it and re-running the comparison does not change it.
create table core.entity_sightings (
  id            bigserial primary key,
  entity_id     bigint not null references core.entities(id) on delete cascade,
  email_id      text not null references core.emails(email_id) on delete cascade,
  -- Which run's job read it, for the trace. Null once that run is gone; the
  -- sighting is still true.
  email_run_id  bigint references core.email_runs(id) on delete set null,
  role          text not null check (role in ('shipper','on_behalf_of','consignee','notify_party',
                  'port_of_loading','port_of_discharge','carrier','vessel','commodity',
                  'sender','signer','addressee','mentioned')),
  source        text not null check (source in ('subject','body','header','document')),
  surface       text not null,
  -- An address belongs to the sighting and not to the company: the same
  -- company is written with one in half the lines that name it and without one
  -- in the other half, and an address may carry a phone or a tax number.
  address       text,
  source_quote  text not null,
  -- The resolver returned candidates of more than one kind and said so. Shown,
  -- never hidden behind a guess.
  ambiguous     boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (email_id, role, source, entity_id)
);
create index on core.entity_sightings (entity_id, role);
create index on core.entity_sightings (email_id);

-- Everywhere a thing has appeared, from either table, under one name.
--
-- `disputed` is how a port that exists only on a wrong draft BL stays out of
-- "shipments to Busan": a question about where cargo went filters `not
-- disputed`. It is true for the BL-side mention of a field the judge called
-- different, and never for the SI side.
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

-- One shipment as one email states it. Written by the ontology job from the
-- `shipment-read` step, and replaced wholesale when that job runs again.
--
-- Where a value is also one of the organisers' seven fields, the extraction's
-- value wins (a reviewer's human_value first), and a field the judge called
-- different lands in disputed_fields with the SI side taken here.
create table core.email_shipments (
  email_id         text primary key references core.emails(email_id) on delete cascade,
  email_run_id     bigint references core.email_runs(id) on delete set null,
  oc_no            text, bl_no text, booking_ref text, invoice_no text, po_no text,
  shipper_id       bigint references core.entities(id) on delete set null,
  consignee_id     bigint references core.entities(id) on delete set null,
  notify_party_id  bigint references core.entities(id) on delete set null,
  pol_id           bigint references core.entities(id) on delete set null,
  pod_id           bigint references core.entities(id) on delete set null,
  carrier_id       bigint references core.entities(id) on delete set null,
  vessel_id        bigint references core.entities(id) on delete set null,
  commodity_id     bigint references core.entities(id) on delete set null,
  voyage           text, hs_code text,
  container_count  int, container_type text, gross_weight_kg numeric,
  trade_term text, payment_term text, bl_type text, freight text,
  -- An email has no sent time. This is the date the mail states in its own
  -- text, and it is null where it states none; core.emails.first_seen_at is
  -- when we ingested it. An answer says which of the two it filtered on.
  mail_date        date,
  mail_date_quote  text,
  disputed_fields  text[] not null default '{}',
  -- Anything the mail states about the shipment that has no column here.
  attributes       jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);
create index on core.email_shipments (mail_date);
create index on core.email_shipments (oc_no);
create index on core.email_shipments (pod_id);
create index on core.email_shipments (consignee_id);

-- A term a question used that is written nowhere in the database, with the
-- definition the model wrote for it. The definition is shown to the reader, so
-- a disagreement about what "Asia" covers surfaces in the answer rather than
-- in the numbers.
create table core.concepts (
  id           bigserial primary key,
  entity_kind  text not null,
  phrase       text not null,
  definition   text not null,
  -- The words a matching profile would likely contain. They rank; they never decide.
  search_terms text[] not null default '{}',
  asked_count  int not null default 1,
  created_at   timestamptz not null default now()
);
create index on core.concepts using gin (phrase public.gin_trgm_ops);

create table core.concept_verdicts (
  concept_id      bigint not null references core.concepts(id) on delete cascade,
  entity_id       bigint not null references core.entities(id) on delete cascade,
  verdict         text not null check (verdict in ('yes','no','unknown')),
  -- So the subquery the agent joins on carries no string literal at all, which
  -- is what lets the chat's literal guard pass a query it did not write.
  matched         boolean generated always as (verdict = 'yes') stored,
  confidence      numeric not null,
  rationale       text not null,
  -- Which profile this was judged against. A rewritten profile makes it stale
  -- and the next question re-judges that one entity.
  profile_version int not null,
  llm_call_id     bigint references core.llm_calls(id) on delete set null,
  decided_at      timestamptz not null default now(),
  primary key (concept_id, entity_id)
);
create index on core.concept_verdicts (concept_id, verdict);
create index on core.concept_verdicts (entity_id);

-- 014 set default privileges so a table created after it is readable, but a
-- view is created by the same role and a grant costs nothing to state. The
-- lesson in 014's header is why these are here and not assumed.
grant select on core.entity_sightings to retina_ro;
grant select on core.email_shipments to retina_ro;
grant select on core.concepts to retina_ro;
grant select on core.concept_verdicts to retina_ro;
grant select on core.entity_appearances to retina_ro;

comment on view core.entity_appearances is
  'Document mentions and mail sightings under one name. Derived: both sides are rebuilt by their own jobs.';
