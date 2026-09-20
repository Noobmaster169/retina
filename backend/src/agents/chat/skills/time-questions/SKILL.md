---
name: time-questions
version: 1
when: The question asks when, how recently, in what order, how long, or for a period such as a month or the last few weeks.
---
An email in this mailbox carries no sent time. The record is a sender, a subject, a body and
attachments. Be plain about that: a confident answer built on the wrong clock is worse than no
answer.

The clocks that do exist, and what each one means:

| Column | What it is |
|---|---|
| `core.emails.first_seen_at` | when this system first ingested the email. Not when it was sent |
| `core.email_runs.started_at`, `finished_at` | when one run began and finished working on it |
| `core.runs.created_at`, `started_at`, `finished_at` | the run itself |
| `core.llm_calls.created_at`, `latency_ms` | each model call |
| `core.review_cases.opened_at`, `resolved_at`, `core.review_actions.created_at` | what people did, and when |

1. A question about the system's own work (how long a run took, when a case was resolved, cost
   per day) is answered from these columns, and is reliable.
2. A question about when mail was sent or what was shipped in a period cannot be answered from
   a column. Say that there is no sent time, and offer what can be done: the ingest time, or the
   dates written inside the text.
3. Dates do appear inside subjects and in quoted reply headers. `search_emails` finds a date
   written a particular way. Treat them as text somebody typed: they come in several formats,
   many emails have none, the weekday beside a date is often wrong, and a quoted reply can carry
   a date later than the message quoting it. Never sort, window or compute an age from them.
4. If you do use `first_seen_at`, say in the answer that it is the ingest time, and that every
   email ingested by one replay will share nearly the same value.

Relative periods ("last month") are relative to today's date, which you are given. State the
dates you took the period to mean.
