---
name: recommend-action
version: 2
when: One email's documents disagree on a field and the question is what a person should do about it, or asks for a reply to the sender.
---
A mismatch is a finding. This skill turns it into a next step and the message that takes it, and
it answers in a fixed shape so the reader can skim it and act.

Work in this order.

1. `explain_decision` on the email. It gives every extracted value with the line it was quoted
   from, whether that quote was found, the judgement on each of the seven fields, and the
   judge's reasoning. Everything below rests on it, so read it first and quote from it.
   `explain_decision` does not carry who sent the mail; `get_email` does, in the same step if you
   have a call free. You need it before you draft anything.
2. Decide whether the difference is real before recommending anything about the documents. A
   field whose quote was **not found in its document** (`evidence_ok` false on either side) is a
   reading to check, not a draft to chase. Say so and stop there for that field.
3. Look up what the model already knows about this sender and this field, because a difference
   that happens on every mail from one sender is a different problem from one that happened
   once. Two reads, both cheap:
   - `analytics.agg_client_run` by `sender_domain` for this run: `emails`, `mismatches` and
     `top_defect_field`.
   - `analytics.fact_field_diff` filtered to `differed` and this `sender_domain`, grouped by
     `field`, for how often each field has differed for them.
   Report the numbers you got. Never say "often" without one.
4. Choose exactly one action per differing field, from this list and no other. The names are
   ours, they are a recommendation and nothing writes them anywhere:
   - `amend_the_draft` — the instruction is the authority and the draft did not follow it. The
     default for a party or a port.
   - `confirm_with_shipper` — the draft may be the newer truth and the instruction stale. For a
     count or a quantity that can legitimately change between the instruction and the loading.
   - `hold_and_escalate` — do not let it go forward until it is settled. For a weight, which is
     declared under the carrier's regulatory obligation, and for a party that would put the
     goods in someone else's hands.
   - `check_retinas_reading` — a quote was not found, or the two values look like the same thing
     written two ways. Verify what was read before troubling anyone.
   - `no_action` — the values differ as text and not in meaning.
5. Say which field weighs most, where there is more than one. A wrong party or a wrong weight
   outranks a wrong count.
6. Draft the reply, and put it in `email_draft` on your final step, not in the prose. `to` is the
   address `get_email` returned for this email, exactly: never the sender domain, never a name
   you compose one from. `subject` names the reference the email carries. `body` addresses the
   sender, lists each field with both values quoted verbatim, asks for one specific thing per
   field, and stays under 150 words: plain and courteous, no greeting invented beyond what the
   thread already uses, and no promise about what happens next.

Answer in this shape, with these headings, and nothing before them:

**What differs** — one line per field: the field, what each document says, and how sure the
judge was.
**Whether it is real** — the evidence check on each side, and anything in the history that bears
on it, with the numbers.
**What to do** — the action name in mono, then one sentence of why, per field.
**The reply** — one clause saying a draft follows below. The message itself is `email_draft`, not
this section: it has its own card, and repeating it in the prose is the same words twice.
**What this rests on** — the run, and the counts you read.

What goes wrong here:

- Recommending an amendment on a field whose quote was never found. That chases a supplier over
  something the parser may have misread, which is the one mistake that costs a relationship.
- Treating a missing field as a difference. `missing` is uncertainty: one side had nothing to
  compare, so there is nothing to amend and the action is to get the document.
- Calling a rewording a mismatch. The judge already accepts most of those; one that reached you
  as `differed` is more likely real, so say so rather than talking the finding down.
- A count from memory. Every number in the answer comes from a read you did on this turn.
- Setting `email_draft.to` to anything `get_email` did not return this turn. It is checked before
  the card is shown and dropped silently if it fails, which reads as the skill doing nothing.
- Writing the reply as though it will be sent. Nothing here sends anything; the card opens the
  reader's own mail client with the draft in it, and the answer should not say otherwise.
