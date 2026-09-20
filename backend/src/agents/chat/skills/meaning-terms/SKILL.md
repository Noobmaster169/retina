---
name: meaning-terms
version: 1
when: A term in the question is not a value in any column: a region, what a company is, what the goods are, or a word like big or problem.
---
Part of this question is a filter and part of it is a meaning. "Tonnage to Asia by month" is a
total over a column and a term no column holds. Split them, run the column part first, and give
the meaning part a meaning before you count anything.

Work in this order. Each numbered step is one turn step, so put its calls together.

1. **Try a stored attribute first.** Every resolved thing carries attributes under `attributes`:
   a port has `country`, `region`, `subregion`, `locode`, `coast`; a party has `country`, `city`,
   `kind`, `sector`, `group`; a commodity has `family`, `hsChapter`, `use`. `region` and
   `subregion` are the UN geoscheme's names, so a question about a region is one `run_sql` on
   `attributes->>'region'`, it is complete, and it costs nothing. Use `describe_schema` or
   `get_entity` on one thing if you are unsure which keys are filled.
2. **Run the column part, and pass it as `candidateSql`.** A question that also names a date, a
   run, a category or a sender narrows first: write a query returning **one column of entity ids**
   and hand it to `find_entities` as `candidateSql`. It is checked exactly as your own SQL is, so
   ground every name in it first.
3. **Call `find_entities` for the meaning.** Give the term as the person wrote it, not a guess at
   what it should be called. It answers with the definition it used, the things that matched, how
   many were judged, and a subquery.
4. **Join on the subquery, never on the list of ids.** The last line of the result is
   `select entity_id from core.concept_verdicts where concept_id = N and matched`. Put it in your
   next `run_sql` as a subquery. It is one indexed join whether three things matched or three
   thousand, and it carries no string literal, so it is never refused.
5. **Answer, saying how you read the term.** The definition comes before the number, in your own
   sentence, not as a quote of the tool.

What the answer has to say, beyond the number:

- **The definition.** "Reading Asia as the UN geoscheme, which puts Western Asia in it: 14 ports."
  A reader who disagrees with the reading can then say so, instead of disagreeing with a count.
- **The measure, for a word that has none.** "Big" is not a column. Say which one you took:
  gross weight, container count, emails, mismatch rate. Say it before the number, once.
- **A lower bound, when the set is partial.** `find_entities` says how many it did not judge.
  If that number is not zero, the total is a lower bound and the sentence says so: "at least 340
  tonnes, over the 12 of 47 customers judged so far". Never write a bare total over a partial set.
- **"None found" and "not known" apart.** The result reports `unknown` separately from `no`. A
  question answered `none` when half the things had nothing to judge is a lie by omission: say
  how many matched, and how many there was no basis either way for.
- **Which date column you filtered on.** `core.email_shipments.mail_date` is the date the mail
  itself states, and it is null on every email that states none; `core.emails.first_seen_at` is
  when we ingested it. Say which you used and how many rows had no `mail_date`. The
  `time-questions` skill has the rest.
- **Unverified knowledge, marked.** A profile's general section is what the model knows about the
  world, not what our mail shows, and `get_entity` says which attribute came from which. Where
  that is what decided the answer, say so in the sentence.

What goes wrong here:

- **Calling `find_entities` for something a column already holds.** A sender domain, a category, a
  status, a field name and a port's country are all columns. The tool would give the same answer
  more slowly and less completely.
- **Listing the matched ids in the next query.** Over a few hundred it stops fitting, and the
  reader loses the one thing a subquery gives them: a query they can run again tomorrow.
- **Taking a second reading of the same term.** Ask once per term. Asking again with different
  words makes a second concept and two answers to one question.
- **Counting a partial set as if it were whole.** This is the only mistake here that reads exactly
  like a correct answer.
