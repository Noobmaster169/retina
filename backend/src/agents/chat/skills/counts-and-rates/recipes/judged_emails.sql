-- name: judged_emails
-- about: The denominators for any comparison rate in one run: emails sorted as comparisons, those with a comparison row, those whose fields a model actually judged, and those that differed.
-- params: run_id uuid
-- returns: comparison_category_emails, with_comparison_row, with_judged_fields, mismatches
select (select count(*) from core.classifications c join core.email_runs er on er.id = c.email_run_id
         where er.run_id = $1::uuid and coalesce(c.human_category, c.final_category) = 'BL_COMPARISON') as comparison_category_emails,
       (select count(*) from core.comparisons cmp join core.email_runs er on er.id = cmp.email_run_id
         where er.run_id = $1::uuid) as with_comparison_row,
       (select count(distinct cmp.email_run_id) from core.field_diffs fd
          join core.comparisons cmp on cmp.id = fd.comparison_id
          join core.email_runs er on er.id = cmp.email_run_id
         where er.run_id = $1::uuid and fd.rationale is not null) as with_judged_fields,
       (select count(*) from core.comparisons cmp join core.email_runs er on er.id = cmp.email_run_id
         where er.run_id = $1::uuid and cmp.status = 'MISMATCH') as mismatches
