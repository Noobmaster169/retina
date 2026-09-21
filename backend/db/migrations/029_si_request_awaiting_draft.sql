-- A shipping instruction is a request for a draft to be drawn up.
--
-- Classify used to finish every non-comparison as `not_comparable`, which put
-- these emails under "No check". The organisers define SI_REQUEST as the mail
-- that asks for a shipping instruction, or hands one over so a bill of lading
-- can be prepared, and it often asks for that draft to be sent back. That is
-- the same waiting state as a comparison request whose draft has not arrived,
-- which already ends as `awaiting_draft`.
--
-- The comparison row, where a reclassify wrote one, stays the organisers'
-- `OK`. What changes is `email_runs.outcome`, which is ours. Invoice questions,
-- general mail and spam stay `not_comparable`.
--
-- Backfills the runs already stored. An image rolled back to before it shows
-- these emails as not comparable again, which is how that image classified them.
update core.email_runs er
   set outcome = 'awaiting_draft'
  from core.classifications c
 where c.email_run_id = er.id
   and er.outcome = 'not_comparable'
   and coalesce(c.human_category, c.final_category) = 'SI_REQUEST';
