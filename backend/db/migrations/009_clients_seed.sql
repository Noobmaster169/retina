-- Phase 9: the clients whose tier orders the queue.
--
-- core.clients has existed since 001 and nothing had ever written a row. This
-- seeds the domains the organisers' own kit names as parties to a shipment,
-- every one of them at the default tier: a tier is a decision a person makes,
-- not something a migration is entitled to assume. The demo raises two.
--
-- Additive and idempotent. Every column already exists, a second apply
-- conflicts away, and a rollback to phase 8 reads these as ordinary rows of a
-- table it already had.
--
-- `name` is filled only where the kit names the party unambiguously
-- (emails/data_v2/pools.py). A domain it does not name keeps a null name
-- rather than an invented one; the page shows the domain either way.
--
-- What is deliberately NOT here: the six phishing senders that also appear in
-- the sample. A seeded list of them would be a sender list fitted to one seed
-- of one dataset, which CLAUDE.md bans and which the judges' dataset would not
-- match. They reach the queue at the tier-3 default like any unknown domain,
-- GET /clients shows them because it lists every sender actually seen, and a
-- person may label one `spam` by hand. Nothing reads that label to decide a
-- category: the model classifies, always.

insert into core.clients (domain, name, tier, kind) values
  ('aprilasia.com',     'APRIL Asia',                3, 'internal'),
  ('april.com.my',      'APRIL Malaysia',            3, 'internal'),
  ('fujitogrp.com',     null,                        3, 'customer'),
  ('psabdp.com',        null,                        3, 'customer'),
  ('ifpla.com',         null,                        3, 'customer'),
  ('algurg.ae',         'AL GURG STATIONERY LLC',    3, 'customer'),
  ('safqa.co.ke',       'SAFQA LIMITED',             3, 'customer'),
  ('roxcel.at',         'ROXCEL TRADING GMBH',       3, 'customer'),
  ('vitalsolutions.sg', 'VITAL SOLUTIONS PTE. LTD.', 3, 'customer')
on conflict (domain) do nothing;
