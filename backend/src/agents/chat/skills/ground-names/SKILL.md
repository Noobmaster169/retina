---
name: ground-names
version: 1
when: The question names a company, a port, a place, a person or any other proper noun.
---
A name in a question is how the person spells it, not how a document does. Find what it means
in the data before you filter on anything.

Do this, in order:

1. Call `find_entity` for every name in the question, all in your first step. Give `kind` only
   when the question makes it certain.
2. Read every candidate, not only the first. Take all that the name plausibly means:
   - A short name that matches several companies of one group means all of them, unless the
     question narrows it.
   - One place is often several things. Two spellings that no document pair ever showed side by
     side stay separate things, so the same port with and without its code can be two ids. Take
     both.
   - Drop a candidate only when it is clearly something else, and say which you took.
3. Filter on the ids, never on a string. `emails_for_entities(...)` answers "which emails", and
   `entity_roles(...)` says whether a thing is a shipper, a consignee, a notify party, a loading port
   or a discharge port. A thing can be one in one email and another in the next.
4. Look in the other places a name lives. Resolved things come only from the documents of
   compared pairs. The same company can also be:
   - a sender: `find_entity` reports sender domains under `elsewhere`; `emails_by_sender_domain(...)`
     lists them;
   - a name in a subject line: `subjects_like(...)` with a pattern such as `%WORD%`;
   - a party in the text of an email that carries no attachment: `search_emails`.
   Report each place as its own line of evidence. A sender is not a consignee, and a mention in a
   subject is not a document field.
5. If nothing matches anywhere, say so, and say the four places you looked.

What goes wrong here:

- Ids are rebuilt when the resolved things refresh. An id is good for this turn. On a later
  turn, find the name again; it is one call.
- `core.entity_mentions` holds one row per extracted field per email run. An email replayed in
  five runs has five sets. Count `distinct email_id`, or fix the run. The recipes already do.
- A value on a draft bill of lading may be one the comparison judged different from the
  instruction. It is still a mention, and it is not evidence of where cargo went.
  `mismatches_for_entities(...)` shows those.

Worked example, with placeholder names. Question: "what do we have on Acme?"
First step, two calls: `find_entity` with text "Acme", and `search_emails` with text "Acme".
Candidates come back as ids 12 and 15, both parties of one group, and one sender domain. Next
step: `entity_roles(...)` with both ids, `emails_for_entities(...)` with both ids and the run, and
`emails_by_sender_domain(...)` with the domain. The answer names both parties, says which fields they
filled and in how many emails, and gives the sender's emails as a separate figure.
