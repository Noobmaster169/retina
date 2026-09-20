-- name: emails_for_entities
-- version: 1
-- about: The distinct emails of one run in which any of these resolved things appears, and the field each appeared in.
-- params: entity_ids bigint[], run_id uuid
-- returns: email_id, subject, sender_domain, field, value
select distinct er.email_id, e.subject, e.sender_domain, m.field, m.value
  from core.entity_mentions m
  join core.email_runs er on er.id = m.email_run_id
  join core.emails e on e.email_id = er.email_id
 where m.entity_id = any($1::bigint[]) and er.run_id = $2::uuid
 order by er.email_id, m.field
