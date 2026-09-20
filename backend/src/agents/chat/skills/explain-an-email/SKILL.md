---
name: explain-an-email
version: 1
when: The question is about one email: what it is, how it was sorted, what was read from its documents, or why it ended as it did.
---
One email's story is already assembled, in the order it happened. Do not rebuild it from the
trace tables.

1. `get_email` gives the summary: stage, category and how sure the model was, who decided it,
   the comparison status, the fields that differ, the review reason, the documents and what
   each was typed as. Use it for "what happened to this email". The sender, subject and body
   are columns of `core.emails`.
2. `explain_decision` gives the whole decision: the classifier's rationale and confidence, the
   second opinion when one was asked for, each document's type, every extracted value with the
   line it was quoted from and whether that quote was found, the judgement on each of the seven
   fields, the escalation and its reason, and what a person did afterwards. Use it for any
   "why".
3. Both take an `emailId` and an optional `runId`. Without one they read this conversation's
   run, or else the latest run that holds the email. If this conversation was opened about an email, that is the email meant by
   "this" or "it".
4. Answer from what came back, in the order it happened, and quote the rationale or the source
   line where it carries the point. Keep the identifiers: the email id, the field names, the
   status.

What goes wrong here:

- The same email can end differently in two runs, because prompts and models change between
  them. Say which run you read.
- A value a person corrected replaces the model's reading everywhere downstream. If the two
  differ, report both and say which one the verdict rests on.
- An email sorted as anything other than a comparison has no documents read and no fields
  judged. That is the design, not a gap: only comparison requests reach the document step.
