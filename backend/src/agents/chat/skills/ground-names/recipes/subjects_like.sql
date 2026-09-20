-- name: subjects_like
-- about: The emails of one run whose subject matches a like pattern. Subjects carry customer names, ports, references and codes that are not columns.
-- params: pattern pattern, run_id uuid
-- returns: email_id, sender_domain, subject, category
select e.email_id, e.sender_domain, e.subject, coalesce(c.human_category, c.final_category) as category
  from core.emails e
  join core.email_runs er on er.email_id = e.email_id
  left join core.classifications c on c.email_run_id = er.id
 where e.subject ilike $1::text and er.run_id = $2::uuid
 order by e.email_id
