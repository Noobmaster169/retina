-- name: run_overview
-- about: How many emails of one run sit at each stage and outcome.
-- params: run_id uuid
-- returns: stage, outcome, emails
select er.stage, er.outcome, count(*) as emails
  from core.email_runs er
 where er.run_id = $1::uuid
 group by er.stage, er.outcome
 order by count(*) desc
