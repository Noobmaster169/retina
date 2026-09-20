---
name: lanes-and-ports
version: 1
when: The question is about where cargo is loaded or discharged, a route, a country or a region.
---
A port is a resolved thing of kind `port`, read from the `port_of_loading` and
`port_of_discharge` fields of documents. The orientation lists the ports that exist.

1. Ground the place first, with `find_entity` and kind `port`. A port is written several ways:
   with or without its country, with or without a code in brackets, and joined with an
   underscore in a subject line. Match by the words of the name.
2. A port's name carries its country as a word. To find the ports of a country, search the
   word: `entities_named_like(...)` with kind `port` and a pattern such as `%COUNTRY%`. There is
   no country or region column.
3. Loading and discharge are different questions. `ports_by_role(...)` gives, for every port of a
   run, the emails where the instruction names it as the loading port and as the discharge
   port. A port that is only ever a loading port is an origin; do not report it as a
   destination.
4. `lanes(...)` gives loading port to discharge port with counts. `emails_for_lane(...)` lists the
   emails of one lane, and takes lists of ids so that several spellings of one place can be
   passed together.
5. A region ("the Gulf", "West Africa") is not stored. Work from the list of ports that exist,
   say which of them you took the region to cover, and say that the grouping is yours.

What goes wrong here:

- These recipes read the shipping instruction's side of each pair. A draft bill of lading can
  carry a port the comparison judged different; counting it would invent a destination.
- A code in brackets after a port can be stale: a document can name one port and carry another
  port's code. Match and report by name.
- One place can be two or three resolved things, because spellings no pair ever showed together
  are never merged. Pass all their ids, and add their counts only with `count(distinct email_id)`
  through a recipe, never by summing the rows.
- Only emails whose documents were compared contribute ports. An email with no attachment names
  its ports in its subject or body: `subjects_like(...)` and `search_emails` reach those, and the
  figure is a separate one.
