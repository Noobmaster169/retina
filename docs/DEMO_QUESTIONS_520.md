# Three hard questions for the organisers' 520

Written the way `emails/data_5k/DEMO_QUESTIONS.md` is, but for the set the judges will see, and
chosen so that none of them is a sentence translated into SQL.

The first draft of this file asked three versions of one question: a place resolved as more than
one thing. That is a real trap and too small a one, because noticing it once teaches you to
notice it everywhere. These three fail in three different ways instead:

1. **The data contains things that are not true.** A fifth of the resolved ports never existed.
2. **One company is four different kinds of evidence**, and three of them are not party columns.
3. **The question cannot be answered as asked**, and the work is knowing that and saying so.

Every figure below was read off the local database, not the brief. The queries are in the
footnote so any of it can be checked or recomputed after a replay.

---

## 1. "Give me every destination we ship to, and tell me which ones you are not sure about."

*Shows:* that a resolved thing is not automatically a fact. Roles, the `disputed` flag, spellings
merged by name and not by code, and an explicit account of what was thrown away.

*Expected:* the inbox has **69 resolved ports. 16 of them are not places we ship to at all** —
they appear only on a draft bill of lading the judge called wrong, which makes them the carrier's
typo and not a destination:

```
BUATAN, INDONESIA (INNSA)        NANTONG CHIMA                 BALTIMORE, US (NGAPP)
PORT KLANG (WESTPORT) (SGSIN)    BUSAN, SOUTH KOREA (AUFRE)    KLAIPEDA, LITHUANIA (USNYC)
SINGAPORE, SINGAPORE (MYPKG)     BUSAN, SOUTH KOREA (VNSGN)    LONG BEACH, US (TRMER)
TUTICORIN, INDIA (ILASH)         MOMBASA, KENYA (AUBNE)        HOCHIMINH CITY (GNCKY)
TUTICORIN, INDIA (KEMBA)         FREMANTLE, AUSTRALIA (CLVAP)  CEBU, PHILIPPINES (MMRGN)
RUGAO/NANTONG/SHANGHAI (SGSIN)
```

Read them. Fifteen are a real port carrying **another port's UN/LOCODE** — Klaipeda with New
York's, Long Beach with Mersin's, Port Klang with Singapore's. The sixteenth, `NANTONG CHIMA`, is
`CHINA` misspelled. Every one of them looks exactly as legitimate as a real row, has a real name,
and has zero undisputed appearances.

That leaves **53 real ports, 46 of which have ever been a destination.** On top of that, the same
place is still several ids where no document pair showed two spellings side by side: Port Klang
is three, and so are Fremantle, Busan, Mombasa, Tuticorin and Ho Chi Minh City.

And half the list are origins, not destinations. Nantong, Port Klang, Singapore, Nhava Sheva and
Buatan are `port_of_loading`; Singapore is 17 loadings against a single discharge.

A good answer separates loading from discharge, merges spellings by the words of the name,
excludes the disputed ones, and **names what it excluded and why**. The last part is the whole
question: "and tell me which ones you are not sure about" is asking for the working, not the list.

*A wrong answer looks like:* 69 ports, or a tidy 46 with no mention that sixteen candidates were
dropped, or Busan counted three times.

---

## 2. "Give me everything on Vital Solutions, and be exact about what they are to us."

*Shows:* one company reaching the database as four different kinds of evidence, of which only two
are party columns. `CHAT.md` states the rule: a company can appear as a resolved party, as a
sender domain, in a subject line and in the body of a mail, they are different evidence, and they
are reported apart.

*Expected:* all four, kept separate, with the direction of trade right.

| Evidence | What it says | Reach |
|---|---|---|
| Sender domain `vitalsolutions.sg` | they write to us | **11 emails** |
| Resolved party, `consignee` | they buy from us | 6 emails |
| Resolved party, `notify_party` | they are told of arrival | 5 emails |
| `on_behalf_of` on our shipper line | **we ship as their agent** | 17 emails; the phrase `ON BEHALF OF VITAL SOLUTIONS PTE LTD` is in **56 of the 520's attachments** |

The fourth is the one that is not in a column. It lives inside the *shipper field's own value*:
the documents read `APRIL FINE PAPER TRADING ON BEHALF OF VITAL SOLUTIONS PTE LTD`. A query that
joins on consignee and notify party finds six and five and never sees the rest.

The company is also resolved as **three entities**, split by a full stop and by that sentence:
`VITAL SOLUTIONS PTE. LTD.` (7 emails), `VITAL SOLUTIONS PTE LTD` (17, all `on_behalf_of`), and
`APRIL FINE PAPER TRADING ON BEHALF OF VITAL SOLUTIONS PTE LTD` (7), the last of which has **two
disputed appearances** and so is partly a carrier's error about our own name.

The answer worth having says: on a handful of shipments they are the customer; on many more we
are the named shipper acting for them; they also write to us directly; and these are opposite
directions of trade that must not be added together.

*A wrong answer looks like:* "a consignee on 6 emails". Or treating the sentence as a fourth
company. Or summing 11 + 6 + 5 + 17 into one number for "39 emails about Vital Solutions".

---

## 3. "Which of our customers has gone quietest since January?"

*Shows:* a question the data cannot answer as asked, and the difference between saying so and
inventing a ranking. This is the one most likely to produce a confident, fluent, wrong answer.

*Expected:* four separate problems, and the answer has to survive all of them.

**There is no date.** The organisers' email record is five keys and none is a time. What exists
is `mail_date`, the date a mail states in its own text, and **only 116 of the 215 shipments read
carry one — 99 state none.** `core.emails.first_seen_at` is when we ingested it, which is a fact
about us and not about the mail. An answer must say which of the two it filtered on, and that
nearly half the shipments are invisible to the first.

**"Our customers" is not what the mailbox is.** **353 of the 520 emails are from us**:
`aprilasia.com` 277 and `april.com.my` 76. Customer domains are the small remainder —
`fujitogrp.com` 37, `psabdp.com` 21, `algurg.ae` 16, `ifpla.com` 16, `safqa.co.ke` 14. Ranking
"quiet" over a mailbox that is two thirds our own outbound mail measures the wrong thing.

**The coverage is thin.** Only **3 of the 125 SI_REQUEST emails** have a shipment reading, so any
per-customer count drawn from shipments is a lower bound and has to be worded as one.

**"Quietest" is in no column.** It needs a stated reading before a number: fewest emails, longest
gap since the last one, or fewest shipments.

The answer worth having states its reading of "quietest", says which date it used and how many
rows have none, gives its figures as a lower bound, or asks back once with real candidates. Any
of those is right. A ranked list of customers with no caveat is the failure this question exists
to catch.

*A wrong answer looks like:* "Roxcel Trading, down 40% since January." Fluent, specific, and
resting on a date column that does not exist.

---

## What these are testing

Not retrieval. The 520 is small enough that everything is reachable. They test whether the agent
will **contradict its own lookup**: throw away sixteen rows that look perfectly good, refuse to
add four true numbers together, and decline to rank anything on a column that is not there.

*Verified against the local database on 2026-09-22. To recompute after a replay: the ghost ports
are entities of kind `port` with no undisputed row in `core.entity_appearances`; the Vital
Solutions figures are that table grouped by role, plus `core.emails.sender_domain`; the date
coverage is `count(mail_date)` against `count(*)` on `core.email_shipments`.*
