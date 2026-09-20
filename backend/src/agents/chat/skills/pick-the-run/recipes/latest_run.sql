-- name: latest_run
-- version: 1
-- about: The newest run, and how far it has got. Use it when the question names no run and the conversation is not scoped to one.
-- params: none
-- returns: run_id, status, total_emails, finished_emails, created_at
select r.id as run_id, r.status, r.total_emails,
       (select count(*) from core.email_runs er
         where er.run_id = r.id and er.stage in ('done', 'review', 'failed')) as finished_emails,
       r.created_at
  from core.runs r
 order by r.created_at desc
 limit 1
