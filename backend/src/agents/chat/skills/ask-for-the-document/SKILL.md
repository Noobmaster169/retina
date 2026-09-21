---
name: ask-for-the-document
version: 1
when: A check stopped because a file could not be read, the wrong file arrived, or one of the two documents is missing, and the reply asking the sender for the right one needs writing.
---
The deliverable is the reply email. It asks the person who sent the mail for the document the
check could not use, and it says what was wrong with what arrived. It does not choose an action,
and it does not guess what the bad file contained.

Work in this order.

1. `get_email` on the email. The `from:` line is the only address the draft may use, and the
   `documents:` line is the list of files that arrived. Call it before you draft, on this turn.
2. `explain_decision` on the same email. The reason the check stopped, and what each file was
   read as, come from there. Quote them. Do not add a filename that neither read showed you.
3. Draft the reply, and put it in `email_draft` on your final step, not in the prose. `to` is the
   `from:` address, exactly. `subject` keeps the email's own subject and adds nothing invented.
   `body` is a short note a clerk would send back:
   - Name each file from the `documents:` line that the reason is about, and say what was wrong
     with it in plain words: it could not be read, it is not the document the check needed, or
     the other document never arrived.
   - Where a file was read as something, say what it was read as. That reading is the false
     document. Do not describe pages you were not shown.
   - Ask them to send the right shipping instruction or bill of lading, and name which one is
     missing. One ask. No promise about what happens next.
   Stay under 200 words. Plain and courteous.

Answer in this shape, with these headings, and nothing before them:

**What arrived.** Each file the reads named, and what it was read as. Say when none arrived.
**What's wrong.** The reason, in plain words, tied to those files. Omit a file you were not shown.
**The reply.** One clause saying a draft follows below. The message itself is `email_draft`.
**What this rests on.** The email id, and that the files came from `get_email`.

What goes wrong here:

- Inventing a filename, a page, or what an unreadable file said.
- Setting `email_draft.to` to anything `get_email` did not return this turn. It is checked
  before the card is shown and dropped if it fails.
- Writing the reply as though it will be sent. The card opens the reader's own mail client.
- Recommending an amendment. This skill asks for a document. It does not judge the fields.
