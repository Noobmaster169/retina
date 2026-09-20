---
name: near-misses
version: 1
when: A lookup came back empty, or found nothing exact, and the question still deserves an answer.
---
Nothing was found. That is a finding, not a dead end, and "none" on its own is the least useful
true sentence you can write. Confirm the miss, then say what is there instead.

Work in this order. Each numbered step is one turn step, so put its calls together.

1. **Confirm the miss where the thing could live.** A name can be a resolved thing, a word in a
   subject line, a word in a body, or a sender domain, and a miss in one of those is not a miss
   in the others. Call `find_entity` and `search_emails` for the term in the same step. For a
   column value call `profile_column` with `near` set to the term: it ranks the stored values by
   closeness instead of by frequency, which is what finds a value that was mistyped.
2. **Widen by the parts of the term.** A place is a city and a country, and a port's name carries
   its country as a word: search the country on its own with `list_entities` and `contains`, or
   with `entities_named_like(...)`. A company name carries a group word: search that word alone.
   One part of a name matching is evidence; the whole of it not matching is not the end.
3. **Look at what does exist of that kind.** The orientation already lists the ports. For anything
   else `list_entities` is one call. You cannot offer an alternative you have not seen.
4. **Relate, with what you know, among the values you have just listed and no others.** Which of
   these ports are nearest the place asked about, which of these companies belong to one group,
   which of these countries the region named covers. This step is yours and not the database's,
   so say so in the answer, and set `basis` to `general_knowledge` on any move that came from it.
   Never relate to a value you have not seen: a port you did not list does not exist here.
5. **Read the number for every alternative before you offer it.** `ports_by_role(...)` gives every
   port of a run with how many emails name it for loading and how many for discharge, which is one
   call for all of them. `emails_for_entities(...)` and `entity_roles(...)` answer the same for
   parties. An alternative with no number read on this turn is dropped before the reader sees it,
   so the call is not optional.
6. **Answer.** Set `outcome` to `none_found`, put the places you actually looked in `checked`, and
   offer at most three alternatives, the most relevant first, in the prose and in `next` both.

What a good answer says, in order: no, and for which run; where you looked; what of the term does
appear and in what role; the nearest things that do exist, each with its number; and which part of
that was your own knowledge rather than the data.

Roles are not interchangeable. A port that only ever loads is not a destination, and offering it as
one is wrong even though the port is real. Say which role each alternative plays.

When the term matches nothing anywhere, and no part of it does either, offer no alternative at all.
An invented neighbour is worse than a plain no, because it reads exactly like a true answer. Offer
one `follow_up` instead: the list of what that kind of thing does hold.

What goes wrong here:

- Offering a thing you reasoned your way to rather than read. Every alternative's name and number
  is checked against what the tools returned on this turn, and one that was not is removed from
  your answer without the reader seeing it. The prose around it is not checked, so an invented
  number there is a lie the code cannot catch. Read it, then write it.
- Reporting "0 emails" for a name you never grounded. An empty result whose filter was a guess
  means the guess was wrong, not that there are none.
- Treating one spelling as the whole thing. The same place can be two resolved things when no
  document pair ever showed the spellings together, so check both before saying a port is absent.
