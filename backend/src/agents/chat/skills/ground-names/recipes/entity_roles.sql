-- name: entity_roles
-- version: 1
-- about: For each of these things, the fields it appears in, across every run, counted in distinct emails.
-- params: entity_ids bigint[]
-- returns: entity_id, canonical, field, mentions, emails
select en.id as entity_id, en.canonical, m.field,
       count(*) as mentions, count(distinct er.email_id) as emails
  from core.entity_mentions m
  join core.entities en on en.id = m.entity_id
  join core.email_runs er on er.id = m.email_run_id
 where m.entity_id = any($1::bigint[])
 group by en.id, en.canonical, m.field
 order by en.canonical, count(distinct er.email_id) desc
