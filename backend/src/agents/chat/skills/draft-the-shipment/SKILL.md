---
name: draft-the-shipment
version: 3
when: A shipping instruction, a bill of lading check, or an invoice question needs the reply email written from the shipment record, including which facts are still blank.
---
The shipment record is what has been read. A blank there is a blank: the mail may say more, and
this skill does not go and read it again. The deliverable is the reply email. It does not choose
an action such as amending a draft or escalating a field. That is another skill.

Work in this order.

1. `get_email` on the email. The `from:` line is the only address the draft may use. Call it
   before you draft, on this turn.
2. `shipment_facts(...)` with that email id. It returns one row per fact, whether or not anyone
   stated it. `on_this_email` is what this mail stated. `elsewhere` is what another email of the
   same consignment stated, and `stated_by` names those emails. A row with both value columns
   empty has not been stated by anyone in the consignment.
3. Where `on_this_email` and `elsewhere` disagree, report both and do not pick one. A disputed
   row is the same kind of unsettled fact: name it, and do not write either value into the draft
   as the one that stands.
4. Draft the reply, and put it in `email_draft` on your final step, not in the prose. `to` is the
   `from:` address `get_email` returned, exactly. `subject` keeps the email's own subject and
   adds nothing invented. `body` is the draft a clerk would send back:
   - For a shipping instruction, it is a draft bill drawn only from facts on record. One line per
     fact that has a value, quoted as the recipe returned it. One line per fact that is blank,
     asking for it. Nothing else.
   - For a bill of lading check, it is a reply about that bill: what is on record, which facts
     are disputed, and a question for each blank. Do not amend a disputed value.
   - For an invoice question, it is a reply about the billing point raised: what terms and
     references are on record, what is still blank, and what can be said from them. Do not invent
     charge amounts the record does not state.
   Stay under 200 words. Plain and courteous. No promise about what happens next.

Answer in this shape, with these headings, and nothing before them:

**On record.** One line per fact that has a value, which email stated it, and the value.
**Still blank.** The field names with no value on this mail and none elsewhere.
**Unsettled.** Facts this mail and another mail state differently, and any disputed row. Omit
the heading when there are none.
**The reply.** One clause saying a draft follows below. The message itself is `email_draft`.
**What this rests on.** The email id, and that the rows came from `shipment_facts`.

What goes wrong here:

- Filling a blank from the subject, from memory, or from a value you were not shown this turn.
- Choosing between two values the consignment does not agree on.
- Setting `email_draft.to` to anything `get_email` did not return this turn. It is checked
  before the card is shown and dropped if it fails.
- Writing the reply as though it will be sent. The card opens the reader's own mail client.
