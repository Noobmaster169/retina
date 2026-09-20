-- name: human_corrections
-- version: 1
-- about: What people changed in one run: the action, the field and side, and the value before and after.
-- params: run_id uuid
-- returns: email_id, kind, field, side, old_value, new_value, actor, created_at
select er.email_id, ra.kind, ra.field, ra.side, ra.old_value, ra.new_value, ra.actor, ra.created_at
  from core.review_actions ra
  join core.email_runs er on er.id = ra.email_run_id
 where er.run_id = $1::uuid
 order by ra.created_at desc
