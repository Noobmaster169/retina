-- name: reviews_by_reason
-- about: The cases of one run that went to a person, by kind, reason and whether they are still open.
-- params: run_id uuid
-- returns: kind, reason, status, cases
select rc.kind, rc.reason, rc.status, count(*) as cases
  from core.review_cases rc
  join core.email_runs er on er.id = rc.email_run_id
 where er.run_id = $1::uuid
 group by rc.kind, rc.reason, rc.status
 order by count(*) desc
