---
name: recommend-action
version: 3
when: One email's documents disagree on a field and the question is what a person should do about it.
---
A mismatch is a finding. This skill names the next step. It does not write the message that
takes it. A reply to the sender is another skill, and `email_draft` stays null on this one.

Work in this order.

1. `explain_decision` on the email. It gives every extracted value with the line it was quoted
   from, whether that quote was found, the judgement on each of the seven fields, and the
   judge's reasoning. Everything below rests on it, so read it first and quote from it.
2. Decide whether the difference is real before recommending anything. A field whose quote was
   **not found in its document** (`evidence_ok` false on either side) is a reading to check, not
   a change to chase. Say so and stop there for that field.
3. Look up what the model already knows about this sender and this field, because a difference
   that happens on every mail from one sender is a different problem from one that happened
   once. `get_email` gives the sender. Then two reads, both cheap:
   - `analytics.agg_client_run` by `sender_domain` for this run: `emails`, `mismatches` and
     `top_defect_field`.
   - `analytics.fact_field_diff` filtered to `differed` and this `sender_domain`, grouped by
     `field`, for how often each field has differed for them.
   Report the numbers you got. Never say "often" without one.
4. Choose exactly one action per differing field, from this list and no other. The names are
   ours, they are a recommendation and nothing writes them anywhere:
   - `amend_the_draft`: the instruction is the authority and the draft did not follow it. The
     default for a party or a port.
   - `confirm_with_shipper`: the draft may be the newer truth and the instruction stale. For a
     count or a quantity that can legitimately change between the instruction and the loading.
   - `hold_and_escalate`: do not let it go forward until it is settled. For a weight, which is
     declared under the carrier's regulatory obligation, and for a party that would put the
     goods in someone else's hands.
   - `check_retinas_reading`: a quote was not found, or the two values look like the same thing
     written two ways. Verify what was read before troubling anyone.
   - `no_action`: the values differ as text and not in meaning.
5. Say which field weighs most, where there is more than one. A wrong party or a wrong weight
   outranks a wrong count.
6. Leave `email_draft` null. Do not write a subject, a greeting, or a message to the sender.

Answer in this shape, with these headings, and nothing before them:

**What differs.** One line per field: the field, what each document says, and how sure the judge was.
**Whether it is real.** The evidence check on each side, and anything in the history that bears on it, with the numbers.
**What to do.** The action name in mono, then one sentence of why, per field.
**What this rests on.** The run, and the counts you read.

What goes wrong here:

- Recommending an amendment on a field whose quote was never found. That chases a supplier over
  something the parser may have misread, which is the one mistake that costs a relationship.
- Treating a missing field as a difference. `missing` is uncertainty: one side had nothing to
  compare, so there is nothing to amend and the action is to get the document.
- Calling a rewording a mismatch. The judge already accepts most of those; one that reached you
  as `differed` is more likely real, so say so rather than talking the finding down.
- A count from memory. Every number in the answer comes from a read you did on this turn.
- Drafting the reply in the prose or in `email_draft`. This skill recommends. It does not write the mail.
