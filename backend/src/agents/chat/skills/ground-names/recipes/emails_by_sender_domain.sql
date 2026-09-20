-- name: emails_by_sender_domain
-- version: 1
-- about: The emails of one run sent from one domain, with the category each was sorted into.
-- params: domain text, run_id uuid
-- returns: email_id, from_addr, subject, category
select e.email_id, e.from_addr, e.subject, coalesce(c.human_category, c.final_category) as category
  from core.emails e
  join core.email_runs er on er.email_id = e.email_id
  left join core.classifications c on c.email_run_id = er.id
 where e.sender_domain = $1::text and er.run_id = $2::uuid
 order by e.email_id
