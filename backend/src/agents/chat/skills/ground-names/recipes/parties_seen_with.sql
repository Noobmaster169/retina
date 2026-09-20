-- name: parties_seen_with
-- version: 1
-- about: The other parties in the same emails as these things, in one run, and the field they filled.
-- params: entity_ids bigint[], run_id uuid
-- returns: other_entity_id, other_party, other_field, emails
select o.entity_id as other_entity_id, en.canonical as other_party, o.field as other_field,
       count(distinct er.email_id) as emails
  from core.entity_mentions m
  join core.email_runs er on er.id = m.email_run_id
  join core.entity_mentions o on o.email_run_id = m.email_run_id and o.entity_id <> all($1::bigint[])
  join core.entities en on en.id = o.entity_id and en.kind = 'party'
 where m.entity_id = any($1::bigint[]) and er.run_id = $2::uuid
 group by o.entity_id, en.canonical, o.field
 order by count(distinct er.email_id) desc, en.canonical
