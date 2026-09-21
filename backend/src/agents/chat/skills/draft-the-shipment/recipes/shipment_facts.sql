-- name: shipment_facts
-- version: 1
-- about: Every fact the ontology keeps about one email's consignment, and whether this email or another email of the same consignment stated it.
-- params: email_id text
-- returns: field, on_this_email, elsewhere, stated_by
with members as (
  select es.email_id,
         es.oc_no, es.bl_no, es.booking_ref, es.invoice_no, es.po_no,
         es.voyage, es.hs_code, es.container_type, es.trade_term, es.payment_term, es.bl_type, es.freight,
         es.container_count::text as container_count,
         es.gross_weight_kg::text as gross_weight_kg,
         nullif(array_to_string(es.disputed_fields, ', '), '') as disputed,
         shipper.canonical as shipper,
         consignee.canonical as consignee,
         nparty.canonical as notify_party,
         pol.canonical as port_of_loading,
         pod.canonical as port_of_discharge,
         carrier.canonical as carrier,
         vessel.canonical as vessel,
         commodity.canonical as commodity
    from core.email_shipments es
    left join core.entities shipper on shipper.id = es.shipper_id
    left join core.entities consignee on consignee.id = es.consignee_id
    left join core.entities nparty on nparty.id = es.notify_party_id
    left join core.entities pol on pol.id = es.pol_id
    left join core.entities pod on pod.id = es.pod_id
    left join core.entities carrier on carrier.id = es.carrier_id
    left join core.entities vessel on vessel.id = es.vessel_id
    left join core.entities commodity on commodity.id = es.commodity_id
   where es.email_id = $1
      or es.email_id in (
        select other.email_id
          from core.shipment_emails mine
          join core.shipment_emails other on other.shipment_id = mine.shipment_id
         where mine.email_id = $1
      )
),
facts as (
  select m.email_id, u.field, u.value
    from members m
   cross join lateral (
     values
       ('oc_no', m.oc_no),
       ('bl_no', m.bl_no),
       ('booking_ref', m.booking_ref),
       ('invoice_no', m.invoice_no),
       ('po_no', m.po_no),
       ('shipper', m.shipper),
       ('consignee', m.consignee),
       ('notify_party', m.notify_party),
       ('port_of_loading', m.port_of_loading),
       ('port_of_discharge', m.port_of_discharge),
       ('commodity', m.commodity),
       ('hs_code', m.hs_code),
       ('container_count', m.container_count),
       ('container_type', m.container_type),
       ('gross_weight_kg', m.gross_weight_kg),
       ('carrier', m.carrier),
       ('vessel', m.vessel),
       ('voyage', m.voyage),
       ('trade_term', m.trade_term),
       ('payment_term', m.payment_term),
       ('bl_type', m.bl_type),
       ('freight', m.freight),
       ('disputed', m.disputed)
   ) as u(field, value)
   where u.value is not null and btrim(u.value) <> ''
),
fields(ord, field) as (
  values
    (1, 'oc_no'),
    (2, 'bl_no'),
    (3, 'booking_ref'),
    (4, 'invoice_no'),
    (5, 'po_no'),
    (6, 'shipper'),
    (7, 'consignee'),
    (8, 'notify_party'),
    (9, 'port_of_loading'),
    (10, 'port_of_discharge'),
    (11, 'commodity'),
    (12, 'hs_code'),
    (13, 'container_count'),
    (14, 'container_type'),
    (15, 'gross_weight_kg'),
    (16, 'carrier'),
    (17, 'vessel'),
    (18, 'voyage'),
    (19, 'trade_term'),
    (20, 'payment_term'),
    (21, 'bl_type'),
    (22, 'freight'),
    (23, 'disputed')
)
select f.field,
       max(v.value) filter (where v.email_id = $1) as on_this_email,
       string_agg(distinct v.value, ' | ') filter (where v.email_id <> $1) as elsewhere,
       string_agg(distinct v.email_id, ', ' order by v.email_id) filter (where v.value is not null) as stated_by
  from fields f
  left join facts v on v.field = f.field
 group by f.ord, f.field
 order by f.ord
