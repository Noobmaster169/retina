# Retina SDOC: Product

Shipping document verification for the Averis x Monash AI Hackathon, built on the Retina stack.
This file says what the product does and for whom. `02-infra-overview.md` says how it is put
together at a high level. `03-infra-deep.md` is the build reference.

## 1. Purpose

A shipping operations team receives every kind of message in one shared inbox. For document
check requests, someone must open the Shipping Instruction (SI) and the draft Bill of Lading
(BL), compare seven fields, and flag anything that differs before the BL is finalised. A wrong
finalised BL means amendment fees, delayed cargo release, or a buyer who cannot collect.

Retina SDOC reads that inbox, sorts every email, checks the documents on comparison requests,
produces a discrepancy report per email, and hands anything it cannot decide to a person with the
evidence attached. Every decision it makes is stored in a queryable knowledge layer so the team
can ask questions about their own operations in plain language.

## 2. Users

| User | What they need |
|---|---|
| Ops documentation staff | A review inbox with the email, both documents, the extracted values side by side, and one-click confirm or correct. |
| Team lead / analyst | A dashboard of throughput, categories, mismatches by client, and a chat page to ask questions over the data. |
| Engineer | A pipeline whose every step is observable, retryable, and measurable against a scorer. |
| Judges | A live demo that shows emails arriving, queues moving, decisions explained, a human correcting one, and a score. |

## 3. The five jobs

1. **Classify** every email into `BL_COMPARISON`, `SI_REQUEST`, `INVOICE_QUERY`, `GENERAL`, or `SPAM`.
2. **Extract** the seven shipment fields from the SI and BL attachments of comparison requests.
3. **Compare** the fields and list exactly the ones that differ, SI value and BL value side by side.
4. **Escalate** when the system cannot decide, with the reason and the source evidence.
5. **Learn** from what reviewers decide, under human approval and an evaluation gate.

The seven fields: `shipper`, `consignee`, `notify_party`, `port_of_loading`, `port_of_discharge`,
`container_count`, `gross_weight_kg`.

## 4. Features

### 4.1 Inbox ingestion

- Emails are pulled from a source and fed into the pipeline one at a time at a configurable rate,
  so arrival can be watched live or run as a burst.
- The first source is the Averis dataset server. The source is an interface, so a Gmail source
  can be added later without touching the pipeline.
- Each replay of an inbox is a **run**. A run has its own results, its own submission file, and
  its own score, so two prompt versions can be compared on the same emails.
- Raw emails and attachments are stored unchanged as the source of truth.

### 4.2 Triage (classification)

- An AI generator classifies every email from the sender, subject, attachment names and body,
  with a short rationale and a confidence. The prompt defines the five categories in the
  organisers' words. There are no hand-written rules: no sender lists, no subject keywords. The
  inbox is one small seeded sample, and a rule fitted to it is an assumption about the next one.
- An AI verifier runs only when the generator's confidence is low. It argues
  against the proposed category and either agrees or overrides.
- The final category, confidence, and which layer decided it (`llm`, `verifier`, `human`) are stored.
- Categories, statuses, review reasons and field names are the organisers' enums, value for value.
- Work is prioritised by client tier (from the sender domain) with shipment tonnage as a tiebreaker.
  Waiting jobs age upward so small clients are never starved.

### 4.3 Document check (comparison)

- Attachment triage: how many files, which is the SI and which the BL, whether a comparison was
  actually requested or only a "please send the draft" message.
- Document-type check before reading: a file named `_BL` that is really an invoice, packing list,
  or certificate of origin is caught here.
- Parsing for `.txt`, `.pdf`, `.docx`, `.xlsx`. Image-only PDFs go through OCR; vision through the
  LLM is used where the proxy supports it.
- AI extraction returns each field as `value`, `source_quote`, and `confidence`. The quote must
  exist in the document text; if not, the AI verifier re-reads the document.
- Comparison is deterministic code: weights as integers, containers as the leading count, ports
  by name with any UN/LOCODE stripped, party names normalised for case, punctuation, and legal
  suffixes. An AI judge is consulted only when two party names still differ after normalisation.
- Outcome per email: `OK`, `MISMATCH` with the differing fields, or `NEEDS_REVIEW` with a reason.
  Blanks and placeholders (`???`, `TBA`, `_______`) are uncertainty, never a mismatch.

### 4.4 Human review inbox

Reviewer sees: the email, both documents (rendered or as text), the extracted fields with their
source quotes highlighted, the comparison table, the escalation reason, and the AI's reasoning.

Reviewer can:

- Confirm the system's result.
- Correct a field value, which re-runs the comparison.
- Reclassify the email.
- Add a note explaining the decision.
- Upload a missing or replacement attachment, which re-runs the document check.

Every action updates the report and is stored as a labelled example. Jobs that failed after
retries appear in the same inbox with the error and a retry button (the brief requires visible
failures and retries).

### 4.5 Knowledge layer (ontology)

- Everything the pipeline touches is a typed entity in Postgres: Email, Attachment, Document,
  Shipment, Party, Port, Carrier, Client, Classification, Extraction, Comparison, FieldDiff,
  ReviewCase, Decision.
- A read-optimised analytics schema (star-schema views) is refreshed on a schedule for fast
  aggregate questions.
- A **chat page** lets a user ask questions in plain language. An agent translates them into
  read-only SQL over the ontology, runs it, and answers with the numbers and the query it used.
  It can also **explain a decision**: given an email id, it narrates the AI
  rationale, the verifier verdict, the extracted evidence, and any human action.
- The same tools are exposed as an MCP server later so teammates can query from Claude Code.

### 4.6 Dashboard

- Run view: emails ingested, per-stage progress, queue depth, throughput, category mix,
  mismatch count, review count, verifier share, LLM cost.
- Email list with filters and a per-email trace page.
- Submit-to-scorer button that posts the run's submission to the Averis server and stores the
  scoreboard. Score history per run and per prompt version.

### 4.7 Evaluation

- The 520 labelled emails are split 80/20, stratified by category and review reason. Few-shot
  examples come only from the 80%. Scores are reported on the 20% and on the full set separately.
- An eval command scores any run locally with the same formula the organisers use
  (`0.50 end_to_end + 0.30 stage1_macroF1 + 0.20 stage3_defectF1`).
- Every AI call stores its prompt version, so a score can be attributed to a prompt.
- Ground truth is used only by the eval harness. The pipeline never reads it.

### 4.8 Self-improvement (gated)

- From reviewer corrections and notes, an agent drafts a candidate lesson for the relevant step
  (for example "labels containing 毛重 mean gross weight").
- A candidate becomes live only after: a human approves it, and the eval harness shows no
  regression on the holdout.
- Lessons are versioned and can be rolled back.

### 4.9 Access

- Frontend behind a shared password gate.
- Backend behind two bearer keys: one for the frontend, one for the team.

## 5. Demo storyline

1. Start a run at 2 emails per second. Dashboard shows emails arriving and queues filling.
2. Open a spam email: the generator's category, confidence and rationale, no verifier needed.
   Open an ambiguous one: the verifier's argument and the category it settled on.
3. Open a mismatch: extracted fields with highlighted source quotes, `SI: 3 / BL: 4` on container
   count, nothing else flagged.
4. Open the review inbox: a scanned PDF escalated as `unreadable` with the page image; an SI with
   `_______ MTS` escalated as `missing_value`, not a false alarm. Correct one, watch the report update.
5. Chat page: "Which client had the most mismatches this run, and on which field?" Then
   "Explain email_407."
6. Submit the run to the scorer. Show the score next to the previous run's score.
7. Show a candidate lesson drafted from the correction in step 4, and the approve button.

## 6. Success criteria

- Score on the organisers' scorer materially above the 0.55 baseline; target 0.85+ on the holdout.
- Zero false escalations caused by parsing gaps on the 520-email set.
- All 20 reference `NEEDS_REVIEW` cases escalated with the correct reason.
- Every email has a trace a reviewer can read without engineering help.
- The pipeline survives a worker restart mid-run without losing or duplicating emails.

## 7. Out of scope for the hackathon

- Real Gmail connection (interface exists, adapter does not).
- Multi-tenant accounts and roles beyond the password gate.
- Fully autonomous prompt editing without human approval.
- Streaming responses in the chat page.

## 8. Glossary

| Term | Meaning |
|---|---|
| SI | Shipping Instruction. Written by the shipper. The reference document. |
| BL | Bill of Lading. Written by the carrier. Draft is checked against the SI. |
| Run | One replay of an inbox through the pipeline, with its own results and score. |
| Organiser enum | A value set fixed by the organisers (category, status, review reason, field name). Never extended. |
| Generator / verifier | The AI that proposes an answer, and the AI that checks it. |
| Evidence | The exact source text an extracted value was read from. |
| Escalation | Sending an email to human review with a reason code. |
| Ontology | The typed, queryable model of everything the pipeline knows. |
| Lesson | A human-approved addition to an agent's instructions. |
