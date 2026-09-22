# Three questions for the organisers' 520

Written the way `emails/data_5k/DEMO_QUESTIONS.md` is, but for the set the judges will actually
see. Each one needs several tool calls and, more to the point, needs the agent to **decide
something** rather than translate a sentence into SQL. A question whose answer is one `where`
clause tests the schema; these test the reading.

What makes them hard here is the same thing in all three: **the resolved things are not the
real things.** `resolve.ts` joins two spellings into one entity only where the field judge saw
them side by side and called them the same, so one place and one company routinely end up as
several ids, and one of those ids is sometimes not a name at all.

**The numbers below are from the live ontology of the local database**, built from the 520 runs
already processed (`GET /ontology/port`, `GET /ontology/party`). They are what the agent should
be able to reach today. A fresh replay under different prompts may resolve slightly differently,
which is the point: the *shape* of each answer is what is being tested, not the digits.

---

## 1. "How much of our cargo actually goes through Port Klang?"

*Shows:* one place resolved as three things; a UN/LOCODE that is not an identity; and the
difference between a port a document mentions and a port cargo went through.

*Expected:* Port Klang is **three entities**, and the answer is wrong unless it takes all of them:

| id | as resolved | emails | roles |
|---|---|---|---|
| 41 | `PORT KLANG (WESTPORT), MALAYSIA (MYPKG)` | 23 | port_of_loading 23 |
| 13 | `PORT KLANG (WESTPORT), MALAYSIA` | 9 | port_of_loading 8, port_of_discharge 1 |
| 57 | `PORT KLANG (WESTPORT), MALAYSIA (SGSIN)` | 1 | — |

The third is the trap. `SGSIN` is **Singapore's** code sitting on a line that names Port Klang,
which is a draft carrying a stale code and not a different port. `CHAT.md` states the rule the
answer has to apply: match a port by the words of its name, never by the code alone.

The second half of the question is `actually`. Port Klang is an **origin** here, not a
destination: of roughly 32 appearances all but one are `port_of_loading`. An answer that reports
it as somewhere cargo goes has read the count and not the role. And a port that exists only on a
wrong draft is marked `disputed` in `core.entity_appearances`, so "actually" means filtering
those out.

*A wrong answer looks like:* "23 emails." One id, taken from the top of the candidate list,
with the other two never noticed.

---

## 2. "Who is Vital Solutions to us?"

The best question in the set, because the answer is mostly **not in any party column**.

*Shows:* one company in two entirely different relationships, resolved as three things, one of
which is a sentence rather than a name.

*Expected:* `VITAL SOLUTIONS PTE LTD` is both a customer and the principal we ship on behalf of,
and a good answer keeps those apart:

| as resolved | emails | roles |
|---|---|---|
| `VITAL SOLUTIONS PTE. LTD.` | 7 | consignee 6, notify_party 5 |
| `VITAL SOLUTIONS PTE LTD` | 17 | on_behalf_of 17 |
| `APRIL FINE PAPER TRADING ON BEHALF OF VITAL SOLUTIONS PTE LTD` | 7 | shipper 3, on_behalf_of 4 |

Three ids for one company, separated by a full stop in `PTE. LTD.` and by the third being the
whole shipper line. **56 of the 520's attachments** carry `ON BEHALF OF VITAL SOLUTIONS PTE LTD`
inside the shipper field's own value, so the relationship lives in the text of a field and not
in a column of its own. A query that joins on consignee and notify party finds six and five and
misses the rest entirely.

The answer worth having says: they buy from us on a handful of shipments, and on many more we
are the named shipper acting for them. Those are opposite directions of trade and reporting one
number for both is the failure this question is looking for.

*A wrong answer looks like:* "A consignee on 6 emails." Or worse, treating
`APRIL FINE PAPER TRADING ON BEHALF OF VITAL SOLUTIONS PTE LTD` as a fourth company.

---

## 3. "What do we ship to Singapore?"

*Shows:* `none_found` answered honestly; a port told apart from a country of registration; and a
code that appears on two ports it does not belong to.

*Expected:* **almost nothing.** `SINGAPORE (SGSIN)` has 18 emails and 17 of them are
`port_of_loading`; exactly one is a discharge. Singapore is where our cargo comes **from**.

Everything else the word turns up is a different kind of fact, and each needs saying apart:

- **Companies registered there**, which is an address and not a destination:
  `ASIA PACIFIC PAPERBOARD TRADING PTE LTD` (our own side, shipper on 21),
  `KPP-ANTALIS (SINGAPORE) PTE. LTD.` (consignee 12, notify 4),
  `VITAL SOLUTIONS PTE. LTD.` (consignee 6, notify 5).
- **`SGSIN` on ports that are not Singapore**: `PORT KLANG (WESTPORT), MALAYSIA (SGSIN)` and
  `RUGAO/NANTONG/SHANGHAI, CHINA (SGSIN)`. A search on the code finds cargo that has nothing to
  do with the place.

So the honest answer is: we load at Singapore and we do not ship to it, here is the one
discharge, here are the Singapore-registered counterparties, and here is why the code is
misleading. `outcome` should be `none_found` for the question as asked, with `checked` naming
where it looked.

*A wrong answer looks like:* "18 shipments to Singapore" — every appearance counted, the role
ignored, and two Malaysian and Chinese loadings swept in by a stale code.

---

## What these are really testing

All three punish the same instinct: trusting that a name resolved once is the whole of a thing.
The 520 is small enough that the agent can reach everything, so none of them is hard for lack of
data. They are hard because the right answer needs the agent to notice that its own lookup
returned several rows for one thing, and to say which of them it took.
