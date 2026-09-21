-- extract v2 and extract-verify v2: a party is the lines that say who it is.
--
-- Under v1 the rule for a party was "return the name only", and `source_quote`
-- was "the exact text of the one line you took the value from". Between them
-- they cover a block whose identification is one line and a block whose next
-- line is the postal address. They say nothing about a line that is neither:
-- one that carries the identification on, such as the principal a shipper acts
-- for. The brief's own coverage table (section 7.3) is why that gap matters:
-- in a PDF every label sits on a line of its own with its value in the lines
-- below it, so where the value ends is a judgement the prompt was leaving to
-- the model, and it was made one way on one document and the other way on the
-- next. Two identical blocks then read as two different values and the judge
-- called the field different, which is a false MISMATCH on a party field.
--
-- v2 states where a party's value ends: it runs to the postal address, and the
-- lines before it that say who the party is are part of it. The same paragraph
-- is in both prompts, because the verifier re-reads a field in doubt from its
-- own copy of the rule and would otherwise undo the first reading.
--
-- Not measured on the holdout yet; see docs/PROGRESS.md.
--
-- Deactivate before activating: prompt_versions_one_active allows one active
-- row per step, so the order of these statements is load-bearing.
update core.prompt_versions set active = false where step = 'extract' and version = 'v1';
update core.prompt_versions set active = false where step = 'extract-verify' and version = 'v1';

insert into core.prompt_versions (step, version, active, notes) values
  ('extract', 'v2', true, 'Phase 6 fix: v1 plus where a party value ends, so a block whose identification runs over more than one line reads the same on both documents'),
  ('extract-verify', 'v2', true, 'Phase 6 fix: the same party rule as extract v2, so a re-read does not undo it')
on conflict (step, version) do update set active = excluded.active, notes = excluded.notes;
