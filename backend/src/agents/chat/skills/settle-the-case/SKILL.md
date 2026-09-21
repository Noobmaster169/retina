---
name: settle-the-case
version: 1
when: One email was handed to a person because a file could not be read, a document is missing, or a value the check needs is blank, and the question is what to do about that email.
---
A parked email is not a disagreement. One side had nothing the check could use, so there is
nothing to amend and no reply to write here. This skill names the next step. `email_draft` stays
null. A message to the sender is another skill.

Work in this order.

1. `explain_decision` on the email. It is why the check stopped. Read it first and quote from it.
2. `get_email` for who sent it, and nothing else about them. Do not go looking for how often this
   happens. This question is about this one email.
3. Name the reason in plain words, then the one step that answers it:
   - `missing_value`: a field the check needs is blank, or a placeholder stands where the value
     should be. Name the field and which document. A blank is not a difference. Do not invent the
     value. If it is on the page, a person types what that document says. If it is not on the page,
     the sender has to supply that line.
   - `unreadable`: a file could not be read, by the parser or by a person. Name the file. The step
     is a reply asking the sender for a copy someone can open. Do not guess what was on it.
   - `missing_attachment`: the email asked for a check and one of the two documents is not there.
     Name which one arrived, if one did. The step is a reply asking the sender for the one that
     did not.
   - `wrong_doc_type`: a file is not the document its name claims. Name the file and what it was
     read as. That reading is the false document. The step is a reply asking for the right one.
     Do not compare the wrong one.
   - A job that stopped, with no reason: nothing about the documents is known. The step is to run
     it again. Nothing about the email itself is wrong.
4. Leave `email_draft` null. Do not write a subject, a greeting, or a message to the sender.

Answer in this shape, with these headings, and nothing before them:

**Why it stopped.** The reason, in plain words, and the file or field it names.
**What is missing.** What the check could not use. One line. Omit a value you do not have.
**What to do.** One step, then one sentence of why.
**What this rests on.** The email, and the read you did.

What goes wrong here:

- Inventing the blank value, or treating a blank as a disagreement to amend.
- Guessing the contents of a file that could not be read.
- Drafting the reply in the prose or in `email_draft`. This skill says what to do. It does not write the mail.
