-- name: emails_by_category
-- about: How many emails of one run were sorted into each category, a person's correction winning over the model.
-- params: run_id uuid
-- returns: category, emails, corrected_by_a_person
select coalesce(c.human_category, c.final_category) as category, count(*) as emails,
       count(*) filter (where c.human_category is not null) as corrected_by_a_person
  from core.classifications c
  join core.email_runs er on er.id = c.email_run_id
 where er.run_id = $1::uuid
 group by 1
 order by count(*) desc
