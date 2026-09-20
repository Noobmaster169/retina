-- name: mismatches_for_entities
-- version: 1
-- about: The differing fields, with both values, in the emails of one run that ended MISMATCH and where any of these things appears.
-- params: entity_ids bigint[], run_id uuid
-- returns: email_id, field, si_value, bl_value, confidence
select distinct er.email_id, fd.field, fd.si_value, fd.bl_value, fd.confidence
  from core.field_diffs fd
  join core.comparisons cmp on cmp.id = fd.comparison_id
  join core.email_runs er on er.id = cmp.email_run_id
 where er.run_id = $2::uuid and cmp.status = 'MISMATCH' and not fd.same and not fd.missing
   and exists (select 1 from core.entity_mentions m
                where m.email_run_id = er.id and m.entity_id = any($1::bigint[]))
 order by er.email_id, fd.field
