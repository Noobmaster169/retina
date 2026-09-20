-- name: emails_for_lane
-- version: 1
-- about: The emails of one run whose shipping instruction loads at any of the first ports and discharges at any of the second.
-- params: pol_ids bigint[], pod_ids bigint[], run_id uuid
-- returns: email_id, subject, port_of_loading, port_of_discharge
select distinct er.email_id, e.subject, pol.canonical as port_of_loading, pod.canonical as port_of_discharge
  from core.extractions x
  join core.email_runs er on er.id = x.email_run_id
  join core.extraction_fields lf on lf.extraction_id = x.id and lf.field = 'port_of_loading'
  join core.extraction_fields df on df.extraction_id = x.id and df.field = 'port_of_discharge'
  join core.entity_mentions lm on lm.extraction_field_id = lf.id
  join core.entity_mentions dm on dm.extraction_field_id = df.id
  join core.entities pol on pol.id = lm.entity_id
  join core.emails e on e.email_id = er.email_id
  join core.entities pod on pod.id = dm.entity_id
 where x.role = 'SI'
   and pol.id = any($1::bigint[]) and pod.id = any($2::bigint[]) and er.run_id = $3::uuid
 order by er.email_id
