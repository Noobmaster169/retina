-- name: lanes
-- version: 1
-- about: Loading port to discharge port as the shipping instructions state them, in one run, counted in distinct emails.
-- params: run_id uuid
-- returns: pol_entity_id, port_of_loading, pod_entity_id, port_of_discharge, emails
select pol.id as pol_entity_id, pol.canonical as port_of_loading,
       pod.id as pod_entity_id, pod.canonical as port_of_discharge,
       count(distinct er.email_id) as emails
  from core.extractions x
  join core.email_runs er on er.id = x.email_run_id
  join core.extraction_fields lf on lf.extraction_id = x.id and lf.field = 'port_of_loading'
  join core.extraction_fields df on df.extraction_id = x.id and df.field = 'port_of_discharge'
  join core.entity_mentions lm on lm.extraction_field_id = lf.id
  join core.entity_mentions dm on dm.extraction_field_id = df.id
  join core.entities pol on pol.id = lm.entity_id
  join core.entities pod on pod.id = dm.entity_id
 where x.role = 'SI' and er.run_id = $1::uuid
 group by pol.id, pol.canonical, pod.id, pod.canonical
 order by count(distinct er.email_id) desc, pol.canonical, pod.canonical
