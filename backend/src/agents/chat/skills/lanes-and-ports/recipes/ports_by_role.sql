-- name: ports_by_role
-- version: 1
-- about: Every port in one run, and in how many distinct emails the shipping instruction names it as the loading port and as the discharge port.
-- params: run_id uuid
-- returns: entity_id, port, loading_emails, discharge_emails
select en.id as entity_id, en.canonical as port,
       count(distinct er.email_id) filter (where m.field = 'port_of_loading') as loading_emails,
       count(distinct er.email_id) filter (where m.field = 'port_of_discharge') as discharge_emails
  from core.entity_mentions m
  join core.extraction_fields f on f.id = m.extraction_field_id
  join core.extractions x on x.id = f.extraction_id and x.role = 'SI'
  join core.email_runs er on er.id = m.email_run_id
  join core.entities en on en.id = m.entity_id and en.kind = 'port'
 where er.run_id = $1::uuid
 group by en.id, en.canonical
 order by 4 desc, 3 desc, en.canonical
