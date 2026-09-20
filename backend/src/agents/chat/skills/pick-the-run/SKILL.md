---
name: pick-the-run
version: 1
when: The answer is a count, a rate or a list, and the question does not say which run it is about.
---
Every fact here belongs to a run. A run is one replay of the inbox, and the same email is
processed again in each one, so a count taken across runs counts the same email several times.

1. If this conversation was opened about a run, that is the run, unless the question names
   another or asks about all of them.
2. Otherwise use the latest run. The orientation names it; `latest_run(...)` reads it fresh and says
   how far it has got.
3. Say in the answer which run the numbers are for, by the first eight characters of its id.
4. `run_overview(...)` gives the stages and outcomes of one run. If many emails are still at
   `classifying` or `comparing`, the run is not finished: say so, because every count is then a
   count so far.
5. A question about every run ("across all runs", "ever") is answered per run, or with
   `count(distinct email_id)`. Never add up emails across runs.

What goes wrong here:

- A small run is not a bad run. Development runs hold twenty or thirty emails on purpose. Do not
  read a low count as a gap in the inbox without saying how big the run is.
- A run can be `completed` while emails are still being compared: `status` is the ingest's, the
  stages are the pipeline's. Trust the stages.
- Resolved ports and parties are built from every run together. Their mention counts are totals
  across runs; the recipes that take a `run_id` are the way to a per-run figure.
