-- A comparison request whose draft has not arrived yet gets its own outcome.
--
-- These emails are classified BL_COMPARISON and cross into the compare queue,
-- and then end there with nothing to compare: the sender is asking us to send
-- a draft BL, not attaching one to be checked. The organisers' generator makes
-- them deliberately (`BL_WITH_ATTACH = 0.55`, so 45 per cent of the category)
-- and their README calls it "a realistic classify-but-can't-compare case".
--
-- The comparison row stays `OK`: that is the organisers' enum and it is what
-- the submission sends, unchanged by this. What changes is `email_runs.outcome`,
-- which is ours and already carries values of ours such as `not_comparable`.
-- It used to say `OK` here too, which put 91 of the 520 inside "Documents
-- agree" on every screen that counts by it, and left them out of the run
-- page's outcome panel entirely: the panel totalled 429 of 520 and the compare
-- lane read "Checked 129 of 220" with nothing saying where the other 91 went.
--
-- Backfills the runs already stored so their pages read the same as a new
-- run's. It rewrites no comparison, no classification and no submission, and
-- an image rolled back to before it shows these emails the way it always did.
update core.email_runs er
   set outcome = 'awaiting_draft'
  from core.comparisons c
 where c.email_run_id = er.id
   and er.outcome = 'OK'
   and c.detail ? 'awaiting_draft';
