-- name: senders_ranked
-- version: 1
-- about: Sender domains of one run by volume, with how many of their emails were comparisons and how many of those differed.
-- params: run_id uuid
-- returns: sender_domain, emails, comparisons, mismatches
select e.sender_domain, count(*) as emails,
       count(*) filter (where coalesce(c.human_category, c.final_category) = 'BL_COMPARISON') as comparisons,
       count(*) filter (where cmp.status = 'MISMATCH') as mismatches
  from core.email_runs er
  join core.emails e on e.email_id = er.email_id
  left join core.classifications c on c.email_run_id = er.id
  left join core.comparisons cmp on cmp.email_run_id = er.id
 where er.run_id = $1::uuid
 group by e.sender_domain
 order by count(*) desc
