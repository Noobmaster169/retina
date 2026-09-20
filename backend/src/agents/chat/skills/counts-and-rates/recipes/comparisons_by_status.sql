-- name: comparisons_by_status
-- about: The comparison outcomes of one run by status and review reason.
-- params: run_id uuid
-- returns: status, review_reason, emails
select cmp.status, cmp.review_reason, count(*) as emails
  from core.comparisons cmp
  join core.email_runs er on er.id = cmp.email_run_id
 where er.run_id = $1::uuid
 group by cmp.status, cmp.review_reason
 order by count(*) desc
