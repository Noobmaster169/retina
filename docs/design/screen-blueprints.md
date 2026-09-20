# Retina SDOC: Screen blueprints

Every surface, laid out, with the components it uses and the data behind it. Read
`../05-design.md` for tokens and `ontology-patterns.md` for the ontology patterns.

Each blueprint names the API route that feeds it, from `../03-infra-deep.md` section 10, so nobody
invents a field the backend cannot serve. Where a blueprint wants something the API does not return
yet, it is marked **needs API**.

**Revised 2026-09-20 against the canvas.** Eleven artboards at 1440x900 were drawn and signed off:

```
https://claude.ai/artifact/CSbrqYfTwzHpGFLVgKQpUZ
```

Sections 3, 5, 6, 7 and 8 below were rewritten from those boards and are what phases 7 and 8
build. Sections 1, 2, 4 and 9 to 13 were written before the canvas and **have not been drawn**:
their layouts still assume the retired inspector, the retired stage bar and the retired provenance
spine, so read them for intent only and draw them against `../05-design.md` sections 4 to 8 before
building. `../docs/phases/phase-07-handover.md` says which of these phase 7 owns.

```
 1  Operations overview       the landing screen                    not drawn
 2  Runs index                every replay, scored                   not drawn
 3  Run detail, live          the screen the demo opens on           drawn, 3 states
 4  Email list                520 rows, filtered                     drawn inside 5
 5  The email                 message, seam, reading, chat           drawn, 3 states
 6  The check                 the seven fields, and both documents   drawn
 7  Review inbox              the human in the loop                  drawn as the case pane
 8  Database and ontology     rows, things, the record, the graph    drawn, 5 boards
 9  Earth                     geography, lanes, the run replay       not drawn, optional
10  Chat                      the agent over the ontology            drawn as a rail, not a page
11  Evaluation                scores, runs compared, prompt versions  not drawn
12  Command palette           the overlay that ties it together      not drawn
13  Gate                      the password screen                    shipped in phase 1
14  Component specifications
15  Empty, loading, failure
```

---

## 1. Operations overview

The landing screen. Answers "what is the state of the desk right now" in one look, above the fold,
with no scrolling and no interaction.

Feeds: `GET /runs` (latest), `GET /runs/:id`, `GET /review?status=open`, `GET /queues`,
`GET /health`.

```
+--------+-----------------------------------------------------------+-----------+
| rail   | Operations                                    [ Start run ]|           |
|        +-----------------------------------------------------------+ inspector |
|        | ACTIVE RUN 044367f9  * live                               | (closed   |
|        | [====== classified ======][== comparing ==][ done ][fail] |  until    |
|        |  312                        84                 120     2  |  something|
|        |                                                           |  is       |
|        | 520 emails   4m 12s elapsed   1.8 /s   $4.06   sonnet v3   |  selected)|
|        +-----------------------------------------------------------+           |
|        | NEEDS REVIEW  3          | LAST SCORE                     |           |
|        | unreadable        1      | 0.8412  run 044367f9           |           |
|        | wrong_doc_type    1      | stage1 0.9604  e2e 0.7826      |           |
|        | missing_value     1      | previous 0.7955  +0.0457       |           |
|        +--------------------------+--------------------------------+           |
|        | LIVE                                              [pause] |           |
|        | +12.4s  <> extract   email_318  sonnet  2.1s  $0.011      |           |
|        | +12.1s  <> judge     email_311  sonnet  1.4s  $0.004      |           |
|        | +11.8s  <> classify  email_402  sonnet  0.9s  $0.002      |           |
|        +-----------------------------------------------------------+           |
+--------+-----------------------------------------------------------+-----------+
```

Zones, top to bottom:

1. **Active run strip.** Run chip with the live dot, the stage bar (section 14.6), and a row of
   micro over mono stats: emails, elapsed, throughput, cost, the pinned prompt set. If no run is
   active, this zone collapses to a single line and a `Start run` primary button.
2. **Needs review** and **Last score**, side by side, equal width, separated by a hairline. Review
   counts break down by `review_reason` in enum order, each a link into a filtered review inbox.
   The score panel shows the final score large, its three components small, and the delta against
   the previous scored run with an explicit sign.
3. **Live feed.** The newest twelve model calls, streaming. Section 14.7.

Rules: no chart on this screen. A chart invites reading; this screen is for glancing. The category
mix donut belongs on the run detail, one click away.

---

## 2. Runs index

Feeds: `GET /runs`.

A single dense table, 36px rows, no filters bar (there are never many runs).

```
RUN        STARTED        SOURCE   EMAILS  STAGE                    PROMPTS        COST    SCORE
044367f9   2h ago         averis   520     [#######################] classify v3   $12.40  0.8412
0a8ed5a5   yesterday      averis   104     [#######################] classify v4   $ 2.61  0.7955
9c1f0b22   yesterday      averis   30      [############---------- ] classify v3   $ 0.74  cancelled
```

- `STAGE` is the stage bar inline at 60px wide, not a text status.
- `SCORE` is mono, right aligned, and takes `--verdict-match` when it beats the previous scored
  run, `--verdict-differ` when it falls. An unscored run shows `not submitted` in
  `--ink-tertiary`. A cancelled run shows the enum in `--ink-tertiary`, never red: cancelling is
  not a fault.
- Selecting a row opens the Run entity in the inspector. Clicking the run id navigates to 3.
- `Start run` is the page's only primary button, top right, opening a modal with source, rate,
  limit, subset, prompt set per step and model per step. Every control is a labelled select with
  the versions `GET /prompts` actually offers. Never a free text field for a version.

---

## 3. Run detail, live

Boards: `Main.dc.html`, `RunTrouble.dc.html`, `RunDone.dc.html`. One layout, three states. Feeds:
`GET /runs/:id`, `GET /runs/:id/emails`, `GET /runs/:id/live`, `GET /queues`, `GET /health`.

```
+--------+-------------------------------------------------------------------+
| rail   | Runs / 044367f9                        [search]         [Running]  |
| 232    +-------------------------------------------------------------------+
|        | Morning run                                   [Pause] [Submit run] |
| nav    | 520 emails at 2 a second, 4 minutes 12 seconds in.                 |
|        +-------------------------------------------------------------------+
| pinned | How the work moves                                                 |
| prompt | [ Sort every email  classify  8 at once ][ Check the two  compare ] |
| set    |  Arriving > Reading > Sorted  ~~>  Waiting > Checking > Checked     |
|        |                  |                                      |          |
| memory |          not_comparable 300              OK  MISMATCH  needs a     |
|        +------------------+------------------+---------------------------+ |
| health | Sorting now  8/8 | Checking now 4/4 | Where they end up          | |
|        | email_493 ...1.1s| email_318 ...2.1s| not_comparable  ====  300  | |
|        | email_494 ...0.9s| ...              | OK              ==     105 | |
|        | (8 rows)         | Next in line     | MISMATCH        =      28  | |
|        |                  | email_319 ...    | unreadable      =       2  | |
+--------+------------------+------------------+---------------------------+-+
```

Zones:

1. **Header.** Breadcrumb, search, and the run status as a tinted chip with no dot. The page title
   is the one `display` line on the screen, with one sentence of plain English under it.
2. **How the work moves.** Six cards in two labelled lanes, left to right, because the code has two
   queues and not one pipeline. The lane pills carry the queue name in mono and its concurrency in
   words (`classify`, `8 at once`). The handoff arrow between `Sorted` and `Waiting` is the only
   `--signal` arrow, and it is labelled with how many crossed. Two branches leave the line: the
   `not_comparable` count at the seam, and the outcome chips under the last card. **This replaces
   the stage bar**, which drew one pipeline and was wrong about the system.
3. **One panel per queue.** One column, one row per email: id in mono, what it is doing in plain
   English, elapsed, and the 2px elapsed rule along the bottom. Eight rows for classify, four for
   compare, matching `CLASSIFY_CONCURRENCY` and `COMPARE_CONCURRENCY`. **needs API**: the active
   job list per queue. `RunSummary.queues` returns counts only.
4. **Where they end up.** Every `Outcome` value in the enum's own words, with a share bar and a
   count, under two micro headers. Values at zero stay visible and grey.
5. **The rail** carries no pinned prompt set and no dependency chips: both were removed as clutter.
   A dependency that is down is named by the banner beside the controls, below.

**The three states are the same page.** Nothing is relaid out:

- **Running.** As above.
- **A dependency is down** (`RunTrouble.dc.html`). The status chip is `Degraded`, a banner beside
  the controls names the dependency and carries the error string (`UpstreamError: doc-extract 503
  after 2 attempts, retryable: true`), the `doc-extract` health chip goes red, `Waiting` turns
  amber, and `Checking` reads `0 / 4`. The checking panel is **the worked example of an empty
  state**: rather than four dashed placeholders it says checking is held, gives the retry, and
  spends the rest of its height on the queue piling up behind it. Sorting is unaffected and keeps
  running, which is the whole point of drawing two queues.
- **Finished and scored** (`RunDone.dc.html`). Both queues are empty, so their panels are
  **replaced rather than emptied**: outcomes settle on the left, the score on the right with its
  three weighted parts, and in the middle the lessons this run drafted. See section 3.1.

### 3.1 What this run taught

The memory panel, and the only place `core.lessons` appears in phase 7's reach. Each card is a
step badge in mono, the lesson in one or two sentences, where it came from (`from 2 corrections,
email_004 and email_046`), and either `Approve` and `Reject` or a shipped version string
(`v1+L17`). The footer states the gate in one sentence.

**`core.lessons` does not exist until phase 11.** Phase 7 renders this panel only when the table
is present, and otherwise leaves the space to the outcomes and the score. Do not fake a lesson.

The rail's memory block is the same feature at a glance: when memory was last written, how many
corrections are waiting for the next draft, and how many lessons have shipped.

---

## 4. Email list

Drawn as the 300px middle pane of section 5, not as a page of its own. Feeds:
`GET /runs/:id/emails`.

A row is 86px and carries, in order: a 20px avatar of the sender's initials, the sender, the time,
the email id in mono, the subject, then the category as a neutral mono chip and the outcome as a
tinted verdict chip. No dot on either chip. Tabs above the list filter it; a `Display` control sets
the density.

---

## 5. The email

Boards: `EmailCheck.dc.html` (MISMATCH), `EmailReview.dc.html` (NEEDS_REVIEW),
`DocsDiff.dc.html` (the documents tab). Feeds: `GET /emails/:runId/:emailId`.

```
+--------+----------+-----------------------------------+-----------------+
| rail   | Inbox    | TO CONFIRM DOCS _ OC1182      MIS | Ask Retina  New |
| 232    | [tabs]   | email_004                         +-----------------+
|        +----------+-----------------------------------+ Reading         |
| nav    | AG  Al   | The check | Both documents | Calls | email_004 2 doc |
|        | Gurg     +-----------------------------------+-----------------+
| views  | email_004| +-------------------------------+ |                 |
|        | MISMATCH | | AG  Al Gurg documentation desk| | Two fields name |
| run    |          | |     docs@algurg.ae to ops@... | | different comp. |
| card   | RX  Rox  | |                               | |                 |
|        | email_074| | Dear Team, please find...     | |      Al Gurg    |
|        | NEEDS_REV| | [SI.txt    ] [BL.txt        ] | |      and AL...  |
|        |          | +-------------------------------+ |                 |
|        |          | -- Below this line is Retina --   | Then notify_... |
|        |          | [ reading, in plain English     ] | +-------------+ |
|        |          | The check                         | | correct_field |
|        |          |  shipper          the same        | | notify_party  |
|        |          |  consignee        differ  [SI][BL]| | was ... is ...|
|        |          |  notify_party     differ          | | [Apply][Once] |
|        |          +-----------------------------------+ +-------------+ |
|        |          | Links to [Differences 2][Client 1] | [ composer    ] |
|        |          | [Confirm][Correct a field][Reclass]|                 |
+--------+----------+-----------------------------------+-----------------+
```

The design problem this screen solves is that a reader could not tell where the sender stopped and
Retina started. Three things fix it, and none of them is optional:

1. **The message is a bordered card.** 1px `--hairline-strong` at `--r-lg`, with its own header
   strip (avatar, sender, to, time), its own body, and its files as chips. It is the only bordered
   card in the product, and it means "this is not ours".
2. **The seam.** A labelled rule directly under it: an icon, the sentence *Below this line is
   Retina, not the sender*, and a hairline to the right edge.
3. **The reading comes before the evidence.** Under the seam, a `--surface` block carries the
   verdict in plain English and then four facts as chips: how it was sorted, how sure, who decided,
   and how many fields differ. Only then the seven fields.

**Tabs**, above the message: `The check`, `Both documents`, `Model calls`. The message card, the
seam and the chat do not move between tabs.

**Links to**, a 44px strip above the action bar: the record's links as counted chips. This is
`search around` (`ontology-patterns.md` section 2.6) at its smallest.

**The chat rail, 340px.** `05-design.md` section 7. It replaces the read only summary pane this
document first specified. **Phase 10 builds it.** In phase 7 the column still exists and carries
the reading, how it was sorted and what the files turned out to be, with the composer disabled and
one sentence saying so. Do not relay the page out twice.

### 5.1 NEEDS_REVIEW

Same shell, same seam, same chat. There is no check to show, so under the reading sits the case:
**why** in plain English, the rendered pages as thumbnails with their per page OCR confidence, the
garbled text it did manage quoted in a well, and what the parser saw (`format`, `pages`, `scanned`,
warnings, straight off `DocumentView`). The action bar changes with it: `Agree, it needs a person`,
`Upload a readable copy`, `Reclassify`.

In the chat, the person states a rule rather than a fix, and Retina proposes a `note`. That is the
honest mapping: a note is what phase 11's drafting job reads.

---

## 6. The check

The component this whole product exists to render, and the one screen a judge will look at
longest. Board: `EmailCheck.dc.html` for the collapsed form, `DocsDiff.dc.html` for the full one.

**Collapsed**, in the tab of section 5. Seven rows in the organisers' order. A row that agrees is
one line: the field name in mono, a plain English verdict (`the same`, `the same, written two
ways`), nothing else. A row that differs expands to show `SI` and `BL` values on their own lines
with the difference marked at the word (`05-design.md` section 4.5), and the judge's sentence under
them.

**Full**, the `Both documents` tab. The rail closes to 56px and the message folds to one line, so
the two documents get the width. Then three columns: the seven fields at 196px, the SI, the BL.
Shared line numbers down both documents. Four marking states, as 4.5 defines them: the selected
field filled, the other difference dashed, every agreeing extracted value dotted, everything else
plain. A footer band carries the judge's verdict on the selected field, its confidence, and the two
line numbers the quotes came from.

The chat on this tab answers about the documents: ask why two values passed and it shows both
source quotes with `quote found` against each, which is `evidence_ok` said out loud.

Rules:

- Never truncate a quote mid line.
- A `missing` field is the hatch (`05-design.md` section 4.6), never the word "missing" in place
  of a value, and never a colour.
- The product never arbitrates. There is no correct value field and no button that writes to one
  document.

---

## 7. Review inbox

Phase 8. Feeds: `GET /review`, `POST /review/:id/actions`, `POST /review/:id/upload`.

**The case pane already exists**: it is section 5.1, and phase 8 must reuse it rather than build a
second component set. What phase 8 adds is the queue in front of it and the write path behind it.

**The queue.** The `Needs a person` destination in the rail opens the same three pane shell with
the list filtered to open cases, grouped by `review_reason` under neutral micro headers, with
failures (`kind = failure`, no reason) in their own group at the foot. A case row is 46px and
carries the email id, the subject, the reason as a violet chip and how long it has been open.

**The actions**, pinned above a hairline at the foot of the case pane, in the order of
`03-infra-deep.md` section 5.5:

| Action | Drawn as | Writes |
|---|---|---|
| confirm | primary, `--ink` filled | `review_actions(kind=confirm)`, case closed, stage `done` |
| correct field | secondary | `review_actions(kind=correct_field, field, old, new)` and `extraction_fields.human_value`, then re-runs compare |
| reclassify | secondary | `review_actions(kind=reclassify)` and `classifications.human_category` |
| add note | secondary, at the right | `review_actions(kind=note, text)` |
| upload | inside the case, beside the unreadable file | an `attachments` row with `origin=human`, then re-runs from triage |
| retry | on a failure case only | a new job from the failed stage |

**Correct a field edits inline on the comparison row**, so the source quote stays visible while the
value is typed. Never a modal. This was true before the canvas and it is still true.

**The chat is the other way in, and it is the same write path.** A person who types "these two
names are one company" gets the proposed action card (`05-design.md` section 7): the action kind
and target in mono, was and is, one sentence on what it will do and what it will teach, and
`Apply and remember` against `Just this once`. Nothing reaches `review_actions` until that button
is pressed.

**needs API, and a real gap**: nothing routes a chat turn to a review action. The contract for that
does not exist in `03-infra-deep.md`. Phase 8 can ship every action from the action bar and leave
the chat's card as the phase 10 path; whoever builds phase 10 has to specify it. Raise it before
building either.

Every action stores a labelled example row, which is the raw material for phase 11.

---

## 8. Database and ontology

Five boards: `DbGrid.dc.html`, `DbEntities.dc.html`, `DbRecord.dc.html`, `ObjectTyped.dc.html`,
`GraphLinks.dc.html`. Phase 10b. Feeds: `GET /ontology/:type`, `GET /ontology/:type/:id`,
`GET /ontology/:type/:id/around`, and the read only `run_sql` pool for the table view.

**One page, two ways in, and the record underneath.** The rail carries both halves: **things**
above (Emails, Documents, Runs, Clients, Differences, then Ports, Parties, Shipments and Carriers
drawn as `planned` because they are not in the schema yet), and **tables** below. A segmented
control in the header says `As things` against `As rows`, so the two are visibly one page.

- **As rows** (`DbGrid.dc.html`). The literal view. Typed column headers with a `pk` / `abc` /
  `123` / `date` badge each, 36px rows, the SQL that produced the page along the bottom, and a
  380px drawer for the selected row holding its fields and then what points at it by foreign key.
  Closest to Supabase, and the reason it exists is that a judge should be able to see the rows.
- **As things** (`DbEntities.dc.html`). The same data as records the model built. 52px rows. One
  opens **in place** into four parts: what is stored, `step out from here` with a count per link,
  **written these ways**, and **where it appeared**, the last three with the field each filled and
  how that email ended. A button opens the record underneath.
- **The record** (`DbRecord.dc.html`). A page for one thing. Four stat tiles, then three columns:
  what is known and the spellings it goes by on the left, every appearance in the middle with the
  field it filled and its outcome, and **where it sits** on the right as a guide ruled tree.

**Written these ways is the ontology's argument.** A port or a party exists only because the field
judge said several spellings denote one thing. The component lists each spelling, how often it was
seen, and how it was judged: `the spelling kept`, `same place`, `an OCR slip, 0.85`, `joined by a
person`. Nothing here came from a lookup table, and the screen says so.

### 8.1 The ontology page

Two tabs, `Record` and `Links`, over one record. `ObjectTyped.dc.html` shows the typed values with
a `written by` column naming the source, a model or code, then the links as cards, then the column
configurator. `GraphLinks.dc.html` shows the same record one hop out with every edge labelled.

**The third tab, Rows and columns, was cut.** It drew a schema chain and a table with typed
headers, which is what section 8's database page does and does better. If a third tab is wanted,
the gap neither page fills is the **type map**: object types and link types with live row counts
and a `built` against `planned` legend, which `ontology-patterns.md` section 5 specifies.

---

## 9. Earth

**Not drawn, and optional.** Phase 10c. `ontology-patterns.md` section 4 still specifies it in
full; nothing in the canvas contradicts it, and nothing in the canvas supports it either. If it is
built, it takes the Air palette and the type scale from `../05-design.md`, and its travelling
squares stay the one exception to "nothing loops".


Full spec in `ontology-patterns.md` section 4. This is the second demo screen after the run
detail, and the two should be shown back to back: the run detail is the desk, the Earth is the
trade the desk is checking.

```
+--------+---------------------------------------------------------+-----------+
| rail   | Earth          [Globe | Flat]  [Volume|Discrep|Client]   | inspector |
|        +-----+---------------------------------------------+-----+  Port     |
|        | LAY |  [sel][around][fit][capture]                 |     |  CNNTG    |
|        | ERS |                                              |     |           |
|        |     |            .-------------.                   |     | SHIPMENTS |
|        | Port|          .'      ___      `.                 |     | 34        |
|        | Lane|         /     .-'   `-.     \                |     |           |
|        | Traf|        |    [] ~~~~~~> []    |               |     | MISMATCH  |
|        | Grat|        |      CNNTG   SGSIN  |               |     | 6  17.6%  |
|        |     |         \                   /                |     |           |
|        | FIND|          `.               .'                 |     | SEARCH    |
|        | [  ]|            `-------------'                   |     | AROUND    |
|        |     |                                              |     | Ship  34 >|
|        | [legend]                                           |     | Diffs  6 >|
|        +-----+----------------------------------------------+-----+           |
|        | [>] 00:00 ..........................|...... 07:46            |       |
|        |     |..|.||.|||.||||.|||||.||||||.|||||||.|||||.|            |       |
+--------+---------------------------------------------------------+-----------+
```

- Globe by default. The lanes between the Chinese and Indian loading ports and the Gulf, East
  African and European discharge ports are the shape of this dataset, and on a rectangle half of
  them wrap round the edge.
- The traffic animation (`ontology-patterns.md` section 4.5) is the thing a judge will remember.
  It is also the thing most likely to be built badly, so it has a hard cap, a fixed screen space
  speed, and a static reduced motion fallback specified.
- The time scrubber at the bottom replays the run. Playing a finished 520 email run back at 8x
  is a 60 second film of the morning's work, and it is the single best use of the demo's last
  minute.
- Layers and Find dock left at 260px. Selection is the standard inspector, not a bespoke panel.
  The toolbar carries Select, Search around, Fit and Capture, and nothing else.
- On a narrow viewport: Flat mode only, the ranked table moves below the map, the scrubber becomes
  a static barcode with no handle.

---

## 10. Chat

**Drawn as a rail, not as a page.** The 340px column in section 5 is where the chat lives, because
the question a person has is always about the thing in front of them. A full page `/chat` still
makes sense for a question that is about the whole inbox rather than one email, and the result
graph below is what it draws; build the rail first.


Feeds: `POST /chat/conversations`, `POST /chat/:id/messages`, `GET /chat/:id`.

```
+--------+---------------------------------------------------+-----------+
| rail   | conversations |  Which client had the most        | inspector |
|        |               |  mismatches this run?             | (whatever |
|        | this run   3  |                                   |  node was |
|        | > mismatches  | +-------------------------------+ |  clicked) |
|        |   by client   | | RESULT GRAPH          [fit]   | |           |
|        |   ports       | |  ask -> run_sql -> agg_client | |           |
|        |               | |              \-> field_diffs  | |           |
|        | yesterday  2  | |                    -> algurg  | |           |
|        |               | +-------------------------------+ |           |
|        |               |                                   |           |
|        |               | Al Gurg had the most, 6 of 46     |           |
|        |               | mismatches in run [044367f9],     |           |
|        |               | and 4 of those were on            |           |
|        |               | [consignee].                      |           |
|        |               |                                   |           |
|        |               | +-------------------------------+ |           |
|        |               | | select c.domain, count(*) ... | |           |
|        |               | | 3 rows, 240ms          [copy] | |           |
|        |               | +-------------------------------+ |           |
|        |               |                                   |           |
|        |               | DOMAIN       MISMATCHES  TOP FIELD|           |
|        |               | algurg.ae    6           consignee|           |
|        |               | safqa.co.ke  4           container|           |
|        |               |                                   |           |
|        |               | [ ask a question                ] |           |
+--------+---------------+-----------------------------------+-----------+
```

Four artefacts per answer, in this order: **result graph**, **prose**, **SQL**, **result table**.
The prose is the shortest of the four, and it is full of inline entity chips. The SQL block is
never collapsed by default: showing the query is the product's answer to "did it make that up",
and hiding it would waste the strongest trust signal on the screen.

`Explain email_407` is a first class question, not a special mode. The agent calls
`explain_decision` and the graph shows that tool with the classification, extraction, diff and
review action nodes hanging off it. The prose narrates the same spine the trace page draws, which
is why the two must use the same vocabulary.

Conversations list left at 240px, grouped by day. No streaming (out of scope per
`01-product.md` section 7), so a pending turn shows the graph building and a skeleton for the
prose.

---

## 11. Evaluation

Feeds: `GET /eval/runs/:id` (dev only), `GET /runs`, `GET /prompts`.

Three zones:

1. **Score history.** A line per component (final, stage 1, stage 3, end to end) across runs on a
   shared x axis of run start time. Four series, direct labelled at the right end, no legend.
   Final in `--ink`, the three components in `--mix-2`, `--mix-3`, `--mix-4`.
2. **Run against run.** Pick two runs, see the prompt set diff at the top and then a table of
   every email whose outcome changed, with the old and new verdict side by side and the pipeline
   strip for each. This is the screen that proves a prompt change helped and where it hurt.
3. **Verdict detail** (dev only, 404 on the box). Every email of a run, its answer beside the
   truth, check by check on the scorer's definitions, per `EmailVerdict`. A `holdout` toggle.

Candidate lessons (phase 11) sit at the bottom as a list: the drafted lesson text, the review
action it came from as a chip, the before and after holdout numbers, and approve and reject. A
lesson that hurt the holdout renders its approve button disabled with both numbers shown, not
hidden.

---

## 12. Command palette

Cmd-K. `--shadow-overlay`, `--r-lg`, 640px wide, centred at 20 percent from the top, over the
scrim.

```
+----------------------------------------------------------+
| > algurg                                                 |
+----------------------------------------------------------+
| CLIENTS                                                  |
|   [cli] algurg.ae                    15 emails           |
| EMAILS                                                   |
|   [eml] email_004   TO CONFIRM DOCS _ OC1182 _ JEBEL ALI |
|   [eml] email_112   RE_ Draft BL MSC LORETO              |
| PARTIES                                                  |
|   [par] AL GURG PAPER TRADING LLC    8 shipments         |
| ACTIONS                                                  |
|   Start a run                                     ctrl R |
|   Open review inbox                               ctrl E |
+----------------------------------------------------------+
| up down to navigate   enter to open   tab for actions    |
```

- Results group by entity type using the same glyphs and the same order as the rail. This is the
  third place the ontology asserts itself, after the rail and the breadcrumb.
- An `email_004` style exact id match pins to the top regardless of group.
- Enter loads into the inspector; cmd-Enter navigates to the entity page.
- The footer hint row is mono-xs, `--ink-tertiary`, on `--surface-sunken`.

---

## 13. Gate

The password screen, `lib/site-gate.ts`. Deliberately the only screen in the product that is
centred and empty.

The mark at 48px, the wordmark beneath it, a single password input 280px wide, one primary button.
No illustration, no marketing copy, no "welcome back". A wrong password renders one line in
`--verdict-fault` beneath the input. That restraint is itself a brand statement: the first thing a
judge sees should look like infrastructure.

---

## 14. Component specifications

### 14.1 Verdict chip

21px tall in a row, 26px in a header. `--r-sm`, 0 7px padding, `mono-sm`, tint background, strong
text. Carries the enum verbatim. **No dot and no icon**: the enum is the icon, and a dot beside it
was the single most repeated note in design review.

| Enum | Background | Text |
|---|---|---|
| `OK` | `--verdict-match-tint` | `--verdict-match` |
| `MISMATCH` | `--verdict-differ-tint` | `--verdict-differ` |
| `NEEDS_REVIEW` | `--verdict-review-tint` | `--verdict-review` |
| `failed` | `--verdict-fault-tint` | `--verdict-fault` |
| `cancelled`, `paused` | `--surface-sunken` | `--ink-tertiary` |

### 14.2 Confidence

**A confidence is a number, not a meter.** The stepped four segment meter this document used to
specify was drawn and cut: it turned one fact into a widget, and beside a verdict chip it read as a
second verdict. A confidence sits in `mono-sm` next to the thing it qualifies, tinted
`--verdict-match` above the verifier threshold and `--ink-secondary` below it.

The threshold is still worth saying out loud, in words rather than in a shape. On the email page
the reading says it: *The second reader did not run. 0.93 sits above the 0.90 line.* When the
verifier did run, name it and what it decided, because `decidedBy` is the honest answer to who
called it.

### 14.3 Evidence well

`--surface-sunken`, `--r-md`, 8px padding, mono-xs, `--ink-secondary`. The span the value was read
from is underlined 1px in the value's colour, 2px below the baseline. Wraps, never scrolls
horizontally. A well whose quote failed the evidence check carries a 2px `--verdict-review` left
rail and an `evidence_failed` chip in its top right.

### 14.4 Entity chip

`ontology-patterns.md` section 2.

### 14.5 Table

- Header row 32px, `--surface-sunken`, micro type, bottom border `--hairline-strong`.
- Body rows 36px, bottom border `--hairline-faint`, hover `--surface-hover`, selected
  `--surface-active` plus a 2px `--ink` left rail.
- Sticky header. Horizontal scroll only when more than eight columns, with the first column pinned.
- Numeric columns right aligned, mono, tabular. Text columns left aligned, `small`.
- Zero state: one line of `small` in `--ink-tertiary`, centred in 96px of height, no illustration.

### 14.6 Stage bar, retired

Cut. It drew the run as one pipeline with the stages in a row, and the system has two queues that
run at once with one crossing between them. A single bar cannot say that, and every reader took it
to mean an email walks the whole row. Section 3 zone 2 replaces it.

What survives from it: a bar is still how a proportion is drawn, and section 4.8 of
`../05-design.md` says where.

### 14.7 Live feed row

28px, mono throughout.

```
+12.4s   <>  extract    email_318   sonnet   2.1s   $0.011   { "shipper": { "value": "APRIL FINE...
```

Elapsed time from run start, not a wall clock, because during a demo the only question is how long
since this started. Step glyph is the ModelCall diamond, filled when complete, outlined with the
live dot when in flight. A failed call takes a `--verdict-fault` left rail and its error replaces
the preview text. New rows enter at the top with a 160ms fade and 4px rise.

### 14.8 Buttons

| Variant | Treatment |
|---|---|
| Primary | `--ink` fill, `--ink-inverse` text, 32px tall, `--r-sm`, no shadow |
| Secondary | `--surface` fill, 1px `--hairline-strong` border, `--ink` text |
| Quiet | no fill, no border, `--ink-secondary` text, underline on hover |
| Destructive | `--surface` fill, 1px `--verdict-fault` border, `--verdict-fault` text. Requires a confirm |

One primary button per screen region. Icon only buttons are 32px square and always carry a title.

### 14.9 Inputs

32px tall, `--surface-sunken` fill, 1px `--hairline` border, `--r-sm`, 13px text. Focus takes the
focus ring and the fill goes to `--surface`. Labels are micro, above, 4px gap. Helper text is
caption, below. An invalid input takes a 1px `--verdict-fault` border and one line of caption in
the same colour. Never a placeholder used as a label.

### 14.10 Toast

Bottom right, 320px, `--surface`, `--shadow-overlay`, `--r-md`, 12px padding, a 2px left rail in
the relevant verdict colour. One line of `small` plus an optional action in quiet button style.
Dismisses after 6s, or stays until dismissed when it carries an action.

---

## 15. Empty, loading, failure

Three states, one treatment each, used everywhere without variation.

**Empty, when the region has nothing to say.** One line of `small` in `--ink-tertiary`, left
aligned at the top of the region, and where an action would resolve it, one quiet button beneath.
No illustrations, no dashed placeholder boxes, and never a grid of empty slots standing in for
full ones. An empty review inbox says `No open cases.` and nothing more.

**Empty, when the region has something better to say.** The stronger rule, and the one review
insisted on: a panel that is empty because the work moved elsewhere gets **replaced, not padded**.
When both queues drain, their panels become the score and what the run taught. When the compare
queue is held, its panel says what is holding it, when it retries, and what is piling up behind it.
Ask what a person needs from that rectangle at that moment, and put that there. An empty state is
a design opportunity, not a placeholder.

**Loading.** Skeleton rows matching the real row height and column widths, `--surface-sunken`, no
shimmer animation. A table that will hold ten rows shows ten skeleton rows, so the layout does not
jump. Never a centred spinner in a region that has a known shape.

**Failure.** A 2px `--verdict-fault` left rail on the region, a one line `small` statement of what
failed in plain English, the error string in a mono-xs well beneath, and a `Retry` secondary
button. The backend being unreachable is a page level version of the same component, and it says
which dependency, from `GET /health`, rather than "something went wrong".

The three are deliberately unglamorous. A product whose empty states are charming and whose
mismatch rows are not is a product that has spent its design effort in the wrong place.
