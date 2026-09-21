-- Phase 13: admission control in front of the pipeline.
--
-- Three new tables and not one change to an existing one, which is what makes
-- the rollback story trivial: an image from before this phase queries none of
-- them and notices nothing. In particular no new `stage` value: `Stage` is a
-- closed enum parsed on both sides of the HTTP boundary, so a held email that
-- carried one would break the run page of the image a failed deploy rolls back
-- to. A held email therefore has no core.email_runs row at all, and the run
-- summary counts it from core.gate_decisions instead.
--
-- Nothing here decides what an email is. These tables hold how much arrived,
-- how often, and what a person decided about a sender. No category, no status
-- and no review reason is stored or implied by any of it.

-- What a person decided about a sender. Absent means nobody has decided, which
-- is not the same as `allow`: an unlisted sender is judged on its record.
--
-- Deliberately empty at migration time. Seeding it would ship a sender list
-- fitted to one seed of one dataset, which is the same argument 009 makes for
-- not seeding the phishing senders, and the judges' dataset would not match it.
create table core.gate_policy (
  principal  text not null,
  scope      text not null check (scope in ('address','domain')),
  policy     text not null check (policy in ('allow','block')),
  reason     text,
  note       text,
  set_by     text,
  set_at     timestamptz not null default now(),
  primary key (principal, scope)
);

-- One row per principal per day: what arrived from it and what it cost. This
-- is the whole memory the standing bracket is computed from, and it is counts
-- and nothing else.
--
-- Standing is earned by distinct active days, never by volume, so `day` being
-- part of the key is the mechanism and not an implementation detail: you
-- cannot buy allowance by sending more on one day.
create table core.gate_activity (
  principal  text not null,
  scope      text not null check (scope in ('address','domain','global')),
  day        date not null,
  emails     int not null default 0,
  units      int not null default 0,
  held       int not null default 0,
  primary key (principal, scope, day)
);
create index on core.gate_activity (scope, day);

-- Every verdict the gate reached, admitted or held, in every mode. Append
-- only: a release stamps the row rather than removing it, because the question
-- a person asks later is what happened, not what is currently true.
--
-- No foreign key on email_id. A decision may be recorded for an email the gate
-- declined to store, which is the point of recording it.
create table core.gate_decisions (
  id           bigserial primary key,
  run_id       uuid references core.runs(id) on delete cascade,
  email_id     text not null,
  from_addr    text not null,
  -- Which principal the verdict was about, and at which scope. For an admit
  -- this is the address; for a hold it is whichever scope refused.
  principal    text not null,
  scope        text not null check (scope in ('address','domain','global')),
  decision     text not null check (decision in ('admit','hold')),
  -- False while GATE_MODE is `observe`: the verdict was reached and recorded
  -- and the email was admitted anyway. What the page draws as "would have held".
  enforced     boolean not null default false,
  reason       text not null,
  standing     text not null,
  units        int not null,
  -- What the units were made of, and what each bucket read at the moment of
  -- the decision. Stored so a row can justify itself a week later without
  -- anyone having to recompute a bucket that has since refilled.
  breakdown    jsonb not null default '{}'::jsonb,
  buckets      jsonb not null default '[]'::jsonb,
  decided_at   timestamptz not null default now(),
  released_by  text,
  released_at  timestamptz
);
create index on core.gate_decisions (decided_at desc);
create index on core.gate_decisions (run_id, decision);
-- The holding pen: held, never released. Partial, because that is the query
-- the page runs and it is a handful of rows out of every decision ever made.
create index on core.gate_decisions (decided_at desc)
  where decision = 'hold' and enforced and released_at is null;
