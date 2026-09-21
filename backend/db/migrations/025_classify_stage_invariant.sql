-- classify v6 and classify-verify v3: a check request stays a check request.
--
-- Under v3/v1 an email that asks for a draft BL to be confirmed, but whose
-- draft never arrived or arrived as some other document, was read as stage 1
-- and answered SI_REQUEST. The prompts define BL_COMPARISON as checking a
-- draft and define stage 1 by "the draft does not exist yet", and neither said
-- which of the two governs when a check request has no usable draft. The
-- organisers' definitions do: every review_reason they list (wrong_doc_type,
-- missing_attachment, unreadable, missing_value) is a BL_COMPARISON that ends
-- in NEEDS_REVIEW, so a fault in the documents is a reason for review and
-- never a different category. v6 and v3 say that, and nothing else changes.
--
-- Measured against 8 freshly seeded inboxes, held out from the tuning, plus
-- the shipped train sample. On 16 check requests whose draft was missing,
-- unreadable or the wrong document, over two passes: 26/32 -> 32/32. On 56
-- ordinary emails across all five categories: 56/56 both ways, so nothing
-- moved the other direction. Numbers in docs/PROGRESS.md.
--
-- Deactivate before activating: prompt_versions_one_active allows one active
-- row per step, so the order of these statements is load-bearing.
update core.prompt_versions set active = false where step = 'classify' and version = 'v3';
update core.prompt_versions set active = false where step = 'classify-verify' and version = 'v1';

insert into core.prompt_versions (step, version, active, notes) values
  ('classify', 'v6', true, 'Phase 2 fix: v3 plus the stage invariant, that what is asked decides the stage and what arrived does not'),
  ('classify-verify', 'v3', true, 'Phase 4 fix: v1 plus the same invariant, and a counter-case must rest on the request, not on a faulty document')
on conflict (step, version) do update set active = excluded.active, notes = excluded.notes;
