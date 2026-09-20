---
name: find-references
version: 1
when: The question gives an order, booking, bill of lading, invoice or purchase order number, or names a vessel, a carrier, a trade term or a kind of goods.
---
None of these is a column, and none is a resolved thing. They are text: in subject lines, in
email bodies, and in the documents. The database can search the first two.

1. Call `search_emails` with the reference exactly as the person gave it. It searches subject
   and body, finds a hyphenated code whole, and returns a snippet showing where it matched.
2. For a code that may sit inside a longer token, such as a carrier code written straight
   against a number, search the subject with a pattern: `subjects_like(...)` with `%CODE%`.
3. To read one of the emails it found, use `get_email`; to see how it was decided, use
   `explain_decision`.
4. Say in the answer that the match is a text match, and quote the part of the subject or the
   snippet that matched.

What goes wrong here:

- The shapes collide. A booking reference and an invoice number can look the same, and a bill of
  lading number and a booking reference can share a prefix. Say what a hit looks like from the
  words around it; do not assert which kind it is.
- A comparison email's subject can carry an invoice number, and an email that hands over a
  shipping instruction can carry a bill of lading number. A reference in a subject does not
  decide what the email is about: its category does.
- The text of the attached documents is not in the database, only the seven fields read from
  them. A vessel or a goods description that appears only inside a document cannot be found here.
  Say so; do not report "none".
- Goods names are cut short in some subjects. Search for the first two or three words.
