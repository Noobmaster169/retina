-- name: entities_named_like
-- version: 1
-- about: Things of one kind with any spelling matching a like pattern, such as a country or a group word. The kind is port or party.
-- params: kind text, pattern pattern
-- returns: entity_id, kind, canonical, matched_spelling, emails
select en.id as entity_id, en.kind, en.canonical, min(n.value) as matched_spelling,
       (select count(distinct er.email_id)
          from core.entity_mentions m
          join core.email_runs er on er.id = m.email_run_id
         where m.entity_id = en.id) as emails
  from core.entities en
  join core.entity_names n on n.entity_id = en.id
 where en.kind = $1::text and n.value ilike $2::text
 group by en.id, en.kind, en.canonical
 order by 5 desc, en.canonical
