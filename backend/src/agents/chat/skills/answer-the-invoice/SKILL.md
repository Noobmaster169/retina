---
name: answer-the-invoice
version: 1
when: An invoice question needs answering from what the consignment record states: charges, terms, references, or whether a fact is on file.
---
The shipment record is what has been read from this mail and from others in the same consignment.
Answer the billing question from those facts only. Do not draft a reply. That is another skill, and
`email_draft` stays null on this one.

Work in this order.

1. `get_email` on the email. Read what the sender is asking: which invoice, which charge, whether to
   cancel, and what breakdown they want. Quote the line that carries the question.
2. `shipment_facts(...)` with that email id. It returns one row per fact, whether or not anyone
   stated it. `on_this_email` is what this mail stated. `elsewhere` is what another email of the
   same consignment stated, and `stated_by` names those emails.
3. Answer from what came back. Quote the facts that bear on the question. Where `trade_term`,
   `payment_term` or `freight` are on record, use them to explain who typically bears which
   charges. Where a fact the question needs is blank on every mail of the consignment, say it is
   not on record and name what would settle it. Do not invent charge amounts the record does not
   state.
4. Leave `email_draft` null. Do not write a subject, a greeting, or a message to the sender.

Answer in this shape, with these headings, and nothing before them:

**The question.** One sentence restating what the sender asked, with the invoice or reference they
named.
**On record.** One line per fact from `shipment_facts` that bears on it: the field, the value, and
which email stated it. Omit facts that do not bear on the question.
**The answer.** What a clerk could say from those facts alone. Where the record is silent, say so
plainly and name what is missing.
**What this rests on.** The email id, and that the rows came from `shipment_facts`.

What goes wrong here:

- Filling a blank from the subject, from memory, or from a value you were not shown this turn.
- Inventing a charge breakdown, an amount, or a cancellation status the record does not state.
- Drafting the reply in the prose or in `email_draft`. This skill answers. It does not write the mail.
