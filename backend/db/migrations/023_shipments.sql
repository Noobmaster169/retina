-- A shipment: the consignment one or more emails describe.
--
-- core.email_shipments is what one email states. This is the thing those
-- statements are about. Two emails belong to one shipment when they share an
-- identifier: an order number, a bill of lading number, a booking reference,
-- an invoice number or a purchase order number. Exact equality on an
-- identifier and nothing else, because an identifier is for identifying and
-- anything looser would be a rule fitted to one sample of one dataset.
--
-- In the inbox as generated today every group holds exactly one email: the
-- generator draws fresh references per email, so no two share one. The
-- grouping is still the right model, and it threads the moment a real mailbox
-- or a different seed puts two emails on one booking.
--
-- Expand only. Nothing is renamed or dropped and every column is nullable or
-- defaulted, so the image this rolls back to still reads the schema.

create table core.shipments (
  id            bigserial primary key,
  -- The identifiers this group was joined on, deduplicated and sorted. The
  -- group's name to a person, and what a later email is matched against.
  refs          text[] not null default '{}',
  -- What the emails of the group agree on, taken from the newest email that
  -- states each. Null where none of them does.
  shipper_id    bigint references core.entities(id) on delete set null,
  consignee_id  bigint references core.entities(id) on delete set null,
  notify_party_id bigint references core.entities(id) on delete set null,
  pol_id        bigint references core.entities(id) on delete set null,
  pod_id        bigint references core.entities(id) on delete set null,
  carrier_id    bigint references core.entities(id) on delete set null,
  vessel_id     bigint references core.entities(id) on delete set null,
  commodity_id  bigint references core.entities(id) on delete set null,
  first_mail_date date,
  last_mail_date  date,
  email_count   int not null default 0,
  -- The seven-field disagreements across every email of the group, so a
  -- shipment says what is unresolved about it without opening an email.
  disputed_fields text[] not null default '{}',
  updated_at    timestamptz not null default now()
);

-- Which emails are in which group. One email is in at most one shipment, and
-- the row is replaced when that email is read again.
create table core.shipment_emails (
  email_id    text primary key references core.emails(email_id) on delete cascade,
  shipment_id bigint not null references core.shipments(id) on delete cascade
);

create index shipment_emails_shipment on core.shipment_emails (shipment_id);
create index shipments_refs on core.shipments using gin (refs);
create index shipments_pod on core.shipments (pod_id);
create index shipments_consignee on core.shipments (consignee_id);
create index shipments_last_mail_date on core.shipments (last_mail_date);
