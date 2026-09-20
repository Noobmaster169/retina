-- name: mismatches_by_field
-- version: 1
-- about: For each of the seven fields, in how many emails of one run that ended MISMATCH the two documents differed. It agrees with the screens.
-- params: run_id uuid
-- returns: field, differing_emails
select fd.field, count(distinct er.email_id) as differing_emails
  from core.field_diffs fd
  join core.comparisons cmp on cmp.id = fd.comparison_id
  join core.email_runs er on er.id = cmp.email_run_id
 where er.run_id = $1::uuid and cmp.status = 'MISMATCH' and not fd.same and not fd.missing
 group by fd.field
 order by count(distinct er.email_id) desc, fd.field
