# Canvas prompt

Paste everything below the rule into a Claude design session. It is self-contained: it carries the
whole design language, the domain model and real sample data, so the session does not need this
repo.

Source of truth remains `docs/05-design.md` and the three files beside this one. If the canvas
session and those disagree, the docs win and this prompt gets corrected.

---

You are designing **Retina SDOC**, a shipping document verification platform. I will work with you
in two stages and I will tell you when to move from the first to the second. Read this whole brief
before you draw anything.

# STAGE RULES, READ FIRST

**Stage 1.** Design **one screen**, in **three variations**. Then stop and wait for me. Do not
design any other screen, do not produce a component library, do not start a design system page.
One screen, three variations, stop.

**Stage 2.** After I pick a direction (possibly a blend), you design the rest of the product
against it, with motion and interaction specified. Do not begin stage 2 until I say so.

Ask me at most three questions before starting stage 1, and only if the answer would change the
layout. Do not ask me about colour, type, spacing or naming: those are fixed below and are not
open. Do not ask whether to proceed.

---

# 1. What Retina is

A shipping operations team at a paper exporter (APRIL, a real pulp and paper company, PaperOne
brand) receives every kind of message in one shared mailbox: draft document checks, instruction
requests, invoice queries, internal notices and spam.

When a **Bill of Lading** draft arrives from a carrier, someone has to open it beside the
**Shipping Instruction** the exporter sent, compare seven fields, and flag anything that differs
before the BL is finalised. A Bill of Lading is a document of title: whoever holds the original can
claim the cargo, banks release payment against it, customs clear against it. An error on a
finalised BL means amendment fees, delayed cargo release, demurrage, or a buyer who legally cannot
collect their shipment.

Retina reads that mailbox with an AI pipeline, sorts every email, opens both documents on a
comparison request, extracts the seven fields with a quoted source line for each, says which ones
differ, and hands anything it cannot decide to a person with the evidence attached.

**The product's one idea, and the thing the design exists to serve:**

> Every number on this screen can be walked back to the line it came from.

Retina is allowed to be wrong. It is not allowed to be unaccountable. Its entire claim on a
documentation team's trust is that any verdict unfolds backwards into the quoted line, the model
that read it, the prompt version that instructed it, and the person who confirmed it. Make
provenance the most available thing on every screen, never a detail panel someone has to dig for.

**The second idea, which the interface must hold apart:** a difference and an uncertainty are not
the same event. `MISMATCH` means the system read both documents and they disagree. `NEEDS_REVIEW`
means it could not read one of them, or a value was blank. Collapsing those into one "problem"
colour is the single worst thing you could do to this design.

## Who uses it

| User | What they need |
|---|---|
| Ops documentation staff | A review queue with the email, both documents, the extracted values side by side, and one click to confirm or correct |
| Team lead | Throughput, category mix, discrepancies by client and by field, and a chat page to ask questions in plain language |
| Engineer | A pipeline whose every step is observable, retryable and measurable |
| Hackathon judges | A live demo: emails arriving, queues moving, decisions explained, a human correcting one, a score |

It is a desk tool. It is used all day on a large screen. Design for that and do not apologise for
density.

---

# 2. The domain model

Design with these exact values. They are fixed by the competition organisers and appear **verbatim
in the UI**, in monospace, never prettified into sentence case. `BL_COMPARISON` never becomes "Bill
of Lading comparison".

**Categories, one per email:**
`BL_COMPARISON` `SI_REQUEST` `INVOICE_QUERY` `GENERAL` `SPAM`

**Status, one per email:**
`OK` `MISMATCH` `NEEDS_REVIEW`

**Review reasons, only when status is `NEEDS_REVIEW`:**
`wrong_doc_type` `missing_attachment` `unreadable` `missing_value`

**The seven fields, in this order, always:**
`shipper` `consignee` `notify_party` `port_of_loading` `port_of_discharge` `container_count`
`gross_weight_kg`

## The pipeline, which is also the provenance spine

Every comparison email goes through these stages in this fixed order. The order never changes, and
a skipped stage keeps its slot. This sequence is the backbone of the whole interface.

```
Ingested -> Classified -> Parsed -> Typed -> Extracted -> Judged -> Decided -> Reviewed
```

| Stage | What happens |
|---|---|
| Ingested | Email and attachments stored |
| Classified | A model reads sender, subject, filenames and body, returns a category, a rationale and a confidence. If confidence is below 0.9 a second model argues the counter-case and may override |
| Parsed | Every attachment becomes text (txt, pdf with OCR, docx, xlsx) or is declared unreadable |
| Typed | A model reads each document and names what it actually is: SI, BL, invoice, packing list, certificate of origin. The filename's claim is checked, never trusted |
| Extracted | A model returns the seven fields per document, each as a value, a `source_quote` and a confidence. The quote must be findable in the document text or the field is re-read |
| Judged | For each of the seven fields, a model answers whether the SI value and the BL value mean the same thing, or whether either is blank |
| Decided | Code collects the fields judged different. `OK`, `MISMATCH` with a field list, or `NEEDS_REVIEW` with a reason |
| Reviewed | A human confirms, corrects a field, reclassifies, uploads a missing file, or adds a note |

## Entity types

These are the nodes of the knowledge model. Each gets a **glyph**, drawn on a 10px grid at 1.25px
stroke. The glyph, never a colour, carries the type. Nothing in the set is a circle: circles are
reserved for the live dot.

| Type | Glyph |
|---|---|
| Run | filled triangle pointing right |
| Email | rectangle with a V from the top corners |
| Attachment | rectangle with the top right corner clipped |
| Document | rectangle with three short horizontal rules inside |
| Classification | three stacked bars of decreasing width |
| Extraction | rectangle with one rule pulled out to the right |
| Field | a pair of square brackets |
| FieldDiff | two short horizontal bars, offset left and right |
| Comparison | two vertical bars with a gap between them |
| ReviewCase | square with a single diagonal hatch line |
| ReviewAction | a check mark inside a square |
| ModelCall | a small diamond |
| PromptVersion | a diamond with a horizontal rule through it |
| Client | filled square |
| Party | square with a notch cut from the top edge |
| Port | hexagon |
| Carrier | chevron pointing right |
| Shipment | square with a vertical rule at one third |
| Submission | upward arrow meeting a horizontal line |

## Real sample data, use this and nothing invented

Mockups filled with "Lorem Company Ltd" look like mockups. These are real values from the dataset.

**Senders:** `docs@algurg.ae` `ops@aprilasia.com` `shipping@fujitogrp.com` `docs@roxcel.at`
`exports@safqa.co.ke` `bl@psabdp.com` `cs@ifpla.com` `win@prize-claims.info`
`alert@webmail-verify.co`

**Subjects, real patterns:**
```
TO CONFIRM DOCS _ OC1182 _ JEBEL ALI _ AL GURG _ MSCU7241893
REQUEST BL DRAFT _ PO 44718_ COATED BOARD__138MT
RE_ Draft BL MSC LORETO NANTONG - amend BL 4
REQUEST SI _ OC0934 _ NHAVA SHEVA _ ROXCEL _ REF88213
SI - MSCU7241893 - DIRECT(MSC) - OC1182 - JEBEL ALI - ORIGINAL
LOCAL CHARGES FOB - SAFQA - OC1044 - TELEX RELEASE CHARGES
14 Mar - UPDATE SUMMARY MSC LORETO
URGENT: Your email storage is full - verify account immediately
```

**Parties:** `APRIL FINE PAPER TRADING PTE LTD` `APRIL FAR EAST (M) SDN BHD`
`ASIA PACIFIC PAPERBOARD TRADING PTE LTD` `AL GURG PAPER TRADING LLC` `AL GHURAIR PAPER LLC`

**Ports:** `NANTONG, CHINA (CNNTG)` `SINGAPORE (SGSIN)` `NHAVA SHEVA, INDIA (INNSA)`
`JEBEL ALI, UAE (AEJEA)` `CONAKRY, GUINEA (GNCKY)` `MOMBASA, KENYA (KEMBA)`

**Carriers:** MSC, Evergreen, ONE, OOCL, PIL

**Field values, with their real messiness:**
```
gross_weight_kg    131,058 KG   /   131058   /   235,550 KG   /   _______ MTS   /   ____MT
container_count    6 x 40'HC    /   3 x 20'GP   /   12 x 20'FCL
ports              NANTONG, CHINA (CNNTG)  against  NANTONG, CHINA
```

**Real document labels, including the bilingual ones. Use at least one of these in any mockup that
shows a source quote, because it is what makes the extraction look real:**
```
Shipper:                          SHIPPER:
Consignee (Non-Negotiable):       To the Order of:
Notify:                           Notify Party:
Port of Loading (POL):            POL:
Gross Wt (kgs):                   Gross Weight (KG):
Gross Weight毛重(KGS): 67,311 KG
Total Containers (箱数):           Container Count:
```

**Real run statistics for stat tiles and charts:**
```
520 emails ingested          4m 12s elapsed          1.8 emails/s
611 model calls              14.2% verifier share    $4.06 at API prices
1.2M input tokens            3 open review cases     score 0.8412 (previous 0.7955)

Category mix:     BL_COMPARISON 220   SI_REQUEST 125   INVOICE_QUERY 75
                  GENERAL 60          SPAM 40
Defects by field: container_count 19  port_of_discharge 13  gross_weight_kg 12
                  notify_party 8      consignee 7  shipper 7  port_of_loading 6
Review reasons:   unreadable 5  wrong_doc_type 5  missing_attachment 5  missing_value 5
```

---

# 3. The design language, fixed

This is not open for redesign. Work inside it. The interesting decisions left to you are structure,
hierarchy, rhythm and interaction, which is where this product's design problem actually lives.

## 3.1 Posture

**Instrument.** Dense, quiet, certain. The tool a team already trusts, not a product being sold to
them. Corporate maritime logistics read through enterprise data infrastructure.

**Light theme only.** There is no dark mode and you should not design one.

Nearest relatives: Palantir Foundry, Attio, Sentry, Cloudflare Observability, Supabase, Linear.

Explicitly not: consumer dashboard gradients, glassmorphism, nautical costume (rope, portholes,
compass roses, anchors, navy and gold), AI product purple, rounded pastel cards.

## 3.2 Colour

**Surfaces.** The page is one step darker than its panels. That inversion is what lets a dense
borderless table read as a surface.

```
--canvas          #F6F8FA   the page behind everything
--surface         #FFFFFF   panels, tables, inspector, overlays
--surface-sunken  #F1F4F7   wells: document text, source quotes, SQL, inputs, table headers
--surface-hover   #F4F6F9   row hover
--surface-active  #EAEFF4   selected row, active nav
--scrim           rgba(15,23,32,0.32)
```

**Lines.** A 1px rule does every separation job in this system.

```
--hairline         #E4E8ED   the default. Panel borders, row separators, dividers
--hairline-strong  #CDD5DE   outer table border, section breaks, map coastlines
--hairline-faint   #EFF2F5   separators inside an already dense table
```

**Ink.**

```
--ink            #0F1720   primary text, primary button fill, interactive default   17.9:1
--ink-secondary  #47566A   labels, secondary text, inactive nav                      7.5:1
--ink-tertiary   #64748B   timestamps, counts, metadata. The floor for readable      4.8:1
--ink-disabled   #A3AEBC   disabled only. Never carries meaning                      2.4:1
--ink-inverse    #FFFFFF
```

**Interactive is ink, not a colour.** Primary buttons are `--ink` filled. Links are `--ink`,
underlined on hover. A selected row is `--surface-active` with a 2px `--ink` left rail. This is the
decision that frees every hue to mean something. Do not introduce a blue link colour.

**Verdict hues. The only five colours that carry meaning.** Each has a strong value for text and
marks, and a tint for badge backgrounds and row washes.

```
--verdict-match   #0B7A4B  tint #E8F4EE   OK, values agree, evidence confirmed
--verdict-differ  #B45309  tint #FEF4E9   MISMATCH. A FINDING, NOT A FAULT
--verdict-review  #6D49B8  tint #F2EDFB   NEEDS_REVIEW, uncertainty handed to a person
--verdict-fault   #B3261E  tint #FCEEEC   the job failed, a dependency is down
--signal          #1B5FA8  tint #E9F0F8   system state: focus, live, running, agent path
```

Two rules stronger than the hexes:

- **Amber and violet never share a badge.** An email is either a difference or an uncertainty.
- **Red is only for faults.** A mismatch is amber because the system succeeded at its job. A
  cancelled run is grey, not red: cancelling is not a fault.

**Hatch, for absence.** A blank field, a placeholder like `_______ MTS`, an unreadable page: 45
degree 1px stripes in `--hairline-strong` at 5px pitch over `--surface-sunken`. Not a colour.
Hazard hatching is an industrial convention, it reads instantly as "nothing here to compare", and
it makes the most consequential confusion in the product (missing against different) safe for every
form of colour vision deficiency.

**Category is never coloured.** Outside charts, a category is a neutral monospace chip in
`--ink-secondary` on `--surface-sunken`. A list of 520 emails coloured five ways is a rainbow nobody
can read, and it would spend the hues that status needs. Category colour exists only where a legend
exists.

**Chart ramps.** No categorical rainbow. Two single hue ramps cover nearly everything.

```
mix ramp (compositions, always with a legend, fixed order BL/SI/INVOICE/GENERAL/SPAM)
  #0F3D66  #1B5FA8  #4A8AC9  #8FB6DC  #CBDCEE

heat ramp (defect frequency, mismatch rate, seven steps for seven fields)
  #7A3A06  #B45309  #D97E2B  #E8A868  #F2C79C  #F7DCC2  #FBEDE0
```

The SI against BL pair is deliberately asymmetric: SI is `--ink-secondary`, BL is
`--ink-secondary` where they agree and `--verdict-differ` where they do not. The BL takes on colour
only where it disagrees. That one rule does more work than any legend.

Chart rules: no gridlines except a 1px baseline, axis labels in micro type, values in mono, no 3D,
no donut unless it is a composition of one whole, no area fill below 30 percent opacity, direct
labels over legends at four or fewer series.

## 3.3 Type

- **UI and display: Inter**, variable, weights 400 / 500 / 600.
- **Data and identifiers: IBM Plex Mono**, weights 400 / 500. Every count, confidence, weight,
  container count, LOCODE, BL number, cost, latency, id and extracted value is set in it. It makes
  them look like they came off a shipping document, which is exactly right.

```
display     28 / 32   600   -0.02em            one page title per screen, nothing else
title       20 / 28   600   -0.015em           panel and modal titles
heading     16 / 24   600   -0.01em            section headings inside a panel
body        14 / 20   400                      the workhorse
body-strong 14 / 20   500
small       13 / 18   400                      dense table cells, secondary prose
caption     12 / 16   400                      metadata, timestamps, helper text
micro       11 / 14   500   +0.06em UPPERCASE  field labels, column heads, eyebrows
mono        13 / 20   400                      extracted values, counts, costs
mono-sm     12 / 18   400                      ids, keys, LOCODEs, model aliases
mono-xs     11 / 16   400                      source quotes, hashes, log lines
```

Everything numeric uses `tabular-nums`. Never centre a number: right align in tables, left align
inline.

**The `micro` style is the signature.** Nearly every labelled value in Retina is a micro label
stacked over a mono value:

```
GROSS WEIGHT (KG)     micro, --ink-tertiary
131,058               mono, --ink
```

Prose caps at 68 characters. Document text in a well caps at 96 and wraps, never scrolls
horizontally, because a reviewer comparing a quote to its source must see the whole line.

## 3.4 Space, shape, density

Base unit 4px. Scale: 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64. Nothing off scale.

```
radius      3px  chips, badges, buttons, inputs
            6px  panels, wells, popovers
            8px  modals only
            0    table cells and rails
            full only the live dot and avatars

rows        28px  ultra dense, the live log feed only
            36px  default, all tables
            44px  comfortable, review cases which carry two lines
            pick one per table, never mix

gutters     24px page, 16px panel padding, 44px panel header with a bottom hairline,
            16px between panels, 32px between sections

borders     1px --hairline is the default and does all separation
            2px appears exactly twice: the left rail on a selected or flagged row,
                and the focus ring
            never 3px
```

**Shadows.** There is exactly one in the product, and only so an overlay reads as floating rather
than cut into the page:

```
--shadow-overlay: 0 8px 24px -8px rgba(15,23,32,0.18), 0 1px 2px rgba(15,23,32,0.06);
```

Command palette, dropdowns, popovers, modals, toasts. Nothing else. Panels, tables, tiles and the
inspector are separated by hairlines alone. **There are no cards in this product.**

**Gradients.** Exactly one, and it appears on one screen: a 4 percent radial vignette at the limb
of the globe on the Earth view, because a flat circle does not read as a sphere without it.

**Focus.** An offset ring, never an outline that shifts layout, on `:focus-visible` only:

```
--focus-ring: 0 0 0 2px var(--surface), 0 0 0 4px var(--signal);
```

## 3.5 The shell

Three panes. Every screen is a variation of this.

```
+--------+-------------------------------------------+---------------------+
| rail   | topbar: breadcrumb / search / run / health |  48px               |
| 240px  +-------------------------------------------+---------------------+
|        |                                           |                     |
| (56px  |  primary pane                             |  inspector          |
| when   |  table, canvas, trace, map, chat          |  400px, resizable   |
| collap |                                           |  320 to 560         |
| sed)   |                                           |                     |
+--------+-------------------------------------------+---------------------+
```

**Left rail, 240px.** Two groups, each under a micro label, separated by a hairline. Putting the
entity types in the navigation is the cheapest way to say, in three seconds, that this product has
a knowledge model and not just a list of emails.

```
ONTOLOGY              OPERATIONS
  Emails       520      Runs
  Documents    250      Review          3
  Shipments    220      Chat
  Parties       78      Evaluation
  Ports         31
  Clients       15
  Carriers       5
```

**Top bar, 48px.** The breadcrumb is not a page path, it is the **ontology path**, and every
segment is a live entity chip:

```
Run 044367f9  /  email_004  /  email_004_BL.txt  /  consignee
```

Right side: global search (cmd-K), the active run as a pill with a live dot, and a health dot,
green when every dependency is up.

**Inspector, right, 400px. The most important structural decision in the product:** selecting
anything, anywhere, opens the same inspector, showing that entity's type, its typed fields, and its
relations as chips. A table row, a node in a graph, a marker on a map, a quote in a document and a
segment in a chart all lead to the same panel. That is what makes the app feel like one graph
without drawing one.

Inspector anatomy, top to bottom: type glyph and id in mono; a verdict badge if it has one; the
provenance spine collapsed to its current step; typed fields as micro over mono pairs; relations
grouped by type as chips with counts; **search around** (section 4.3); actions pinned above a
bottom hairline.

Below 1280px the inspector becomes an overlay sheet. Below 1024px the rail collapses to glyphs.
Below 768px it is a read only list and detail view: no map, no graph, no table wider than four
columns. Retina is a desk tool and the design should admit that rather than pretend.

## 3.6 Voice

- State verdicts. "consignee differs", never "a possible discrepancy was detected".
- Never call a mismatch an error. The system worked. A mismatch is a finding.
- Never show a confidence without its number, nor the number without its scale.
- **Never imply arbitration.** Retina detects symmetric difference: it says the two documents
  disagree, never which one is right. There is no "correct value" field anywhere and no "fix"
  button that writes to one side.
- Plain English around the enums, enums verbatim inside them. "2 fields differ: `consignee`,
  `notify_party`."
- **No em dashes anywhere in UI copy.** Use commas, colons, or a new sentence.
- **No emoji anywhere**, including in glyph sets and empty states.

## 3.7 Anti-patterns

Each of these is a thing a competent designer does by reflex, and each one breaks this language.

- A card with a shadow. There are no cards. Use a panel with a hairline.
- Colouring the category column.
- Red for a mismatch.
- A percentage bar for confidence. It is a four segment stepped meter.
- Prettifying an enum into sentence case.
- A "correct this value" button that writes to one document.
- A hero number with no unit and no scale.
- A donut chart of anything that is not a composition of one whole.
- Purple gradients, sparkle glyphs, or any other marker of "this part is AI". The whole product is
  AI. Marking it is noise and it undercuts the claim that this is infrastructure.
- Animating a number upward on a live counter.
- Charming empty states in a product whose mismatch row is not yet beautiful.
- A second nav pattern, a second table style, or a second set of status colours.

---

# 4. The signature patterns

These are what make Retina itself rather than a competent enterprise dashboard. They appear in
stage 1 only where the chosen screen needs them; they are here so you design the dashboard knowing
what it has to lead into.

## 4.1 The provenance spine

A vertical chain showing how a verdict was reached, in fixed pipeline order, where every node
expands into its own evidence.

```
 x=0   x=11
 |      |
 |   [#]---- Classified      BL_COMPARISON  0.93  sonnet  v3    >     36px min
 |    |                      the sender asks for the draft BL to be...
 |   [#]---- Parsed          2 documents, 0 unreadable          >
 |    |
 |   [#]---- Typed           SI 0.99   BL 0.98                  >
 |    |
 |   [#]---- Extracted       14 values, 14 with evidence        >
 |    |
 |   [!]---- Judged          5 same, 2 different                v
 |    |      (expands into the seven comparison rows, 4.2)
 |   [!]---- Decided         MISMATCH  consignee notify_party   >
 |    |
 |   [ ]---- Reviewed        not opened
```

- Rail 1px `--hairline` at x=11. Marker a **7px square** centred on it. Node min-height 36px,
  padding-left 28px. Stat cluster right aligned in mono-sm `--ink-tertiary`: confidence, model
  alias, prompt version, latency, cost.
- Marker states: complete filled `--ink`; produced a finding filled `--verdict-differ`; escalated
  filled `--verdict-review`; failed filled `--verdict-fault`; running now a 1.5px `--signal`
  outline with the live dot beside the label; not started a 1px `--hairline-strong` outline;
  deliberately skipped a 3px `--ink-disabled` dot.
- **The rail segment entering a finding node takes that node's verdict colour**, and the segment
  after a failure goes `--hairline-faint` because nothing downstream ran. Someone scanning only the
  rail can see where the story turned.
- Order never changes, even when a stage was skipped. The spine's shape is constant across every
  email, which is what lets two of them be compared at a glance.

**The strip.** The same spine compressed to 60px for a table row: seven 7px markers, 4px gaps, same
state colours, no labels, tooltip on hover.

```
[#][#][#][#][!][!][ ]
```

In a 520 row table this gives per row pipeline state and the location of any finding in 60px of
column. It is the highest value small component in the system: it makes a list of emails read as a
list of processes. **Put it in the dashboard's email table in all three stage 1 variations.**

## 4.2 The field comparison row

This component is the product. Everything else is scaffolding around it.

```
FIELD              SI                                    BL
------------------------------------------------------------------------------------
[=] shipper        APRIL FINE PAPER TRADING PTE LTD      APRIL FINE PAPER TRADING PTE LTD
                   "Shipper: APRIL FINE PAPER TRADING"   "SHIPPER: APRIL FINE PAPER TRADING"
                   same   0.99

[!] consignee      AL GURG PAPER TRADING LLC             AL GHURAIR PAPER LLC
 |                 "Consignee (Non-Negotiable): AL GURG" "To the Order of: AL GHURAIR PAPER LLC"
 |                 different   0.96
 |                 "the two companies are distinct legal entities, not a spelling variant"

[~] gross_weight_kg  ///////////////                     235,550 KG
                   "Gross Wt (kgs): _______ MTS"         "Gross Weight (KG): 235,550 KG"
                   missing   0.94
```

- **SI column always neutral ink.** It is the reference document in the human workflow.
- **BL column takes `--verdict-differ` only where the judge said different.** Everywhere else it is
  the same neutral as the SI. Colour appears exactly where the finding is.
- A field judged missing shows the **hatch block** on the blank side. Never a colour, never the word
  "missing" in place of the value. The raw placeholder still appears in the quote, because
  `_______ MTS` is itself the evidence.
- Every value carries its source quote directly beneath in a `--surface-sunken` well, mono-xs, with
  the matched span underlined 1px in the value's colour.
- Left gutter markers match the spine: `[=]` filled ink for same, `[!]` amber for different, `[~]`
  hatched for missing. A different row also takes a 2px amber left rail spanning its full height.
- **Fields appear in enum order always**, differing or not. Sorting differences to the top would
  hide that five fields were checked and agreed, which is most of what the system did.
- No correct value column. No fix button.

## 4.3 Entity chips and search around

Ontology as connective tissue, so the graph is traversable from anywhere without a graph being
drawn.

**Chip:** 20px tall, 6px horizontal padding, 3px radius, `--surface-sunken` fill, 1px `--hairline`
border, a 10px type glyph, 4px gap, mono-sm label. Variants: inline (no fill or border, underlined
label, used in prose), dense (glyph and label only, in a table cell), counted (a divided count
segment on the right), ghost (`--ink-disabled`, an entity referenced but not in this run).

Hover for 400ms opens a 280px popover with the entity's headline stats and up to three relation
groups. Click loads the inspector. Cmd-click opens its page. **Chips are always neutral**; if the
entity has a verdict, a separate badge sits beside the chip.

Labels are the natural key verbatim: `email_004`, `email_004_BL.txt`, `gross_weight_kg`,
`algurg.ae`, `CNNTG`.

**Search around**, at the bottom of every inspector. It lets a reader step a whole link type at once
and it is the cheapest way to make a relational schema feel like a graph.

```
SEARCH AROUND  email_004

  Documents                 2   >
  Fields                   14   >
  Diffs                     2   >
  Model calls              11   >
  Client                    1   >
  Same client, mismatched   6   >
  Same POD, mismatched      3   >
```

The last rows are **derived traversals**, two or three hand-chosen per entity type, not raw foreign
keys. They are what make this feel like a knowledge tool rather than a schema browser. A link type
with zero results still shows, in `--ink-disabled`: knowing there are no diffs is worth a row.

## 4.4 Histogram facets

The filter bar drops into facets rather than plain selects, so choosing a filter is also reading the
distribution.

```
CATEGORY                          CONFIDENCE              REVIEW REASON
[x] BL_COMPARISON  220 |||||||    0.5 .                   [ ] unreadable       5 |
[ ] SI_REQUEST     125 |||||      0.6 .                   [ ] wrong_doc_type   5 |
[ ] INVOICE_QUERY   75 |||        0.7 ||                  [ ] missing_attach   5 |
[ ] GENERAL         60 ||         0.8 |||                 [ ] missing_value    5 |
[ ] SPAM            40 |          0.9 ||||||||||||
```

Bars are 1px rules in `--ink-tertiary`, scaled to the largest bucket. Not charts, rules. Selecting a
value renarrows every other facet's counts. The confidence bucket containing the verifier threshold
(0.9) carries a 1px `--signal` rule above it, so a reader sees how much of the run sat near the
line.

## 4.5 Chat result graph

When the agent answers a question, it shows what it touched as a small graph above the prose.
Layered left to right, hierarchical, deterministic. **Never force directed.** It settles once and
freezes: no physics, no jitter, no drift while someone reads.

```
  question        tool            relation           entities
  +--------+      +----------+     +-------------+    +----------------+
  | ask    |----->| run_sql  |---->| agg_client  |--->| algurg.ae      |
  +--------+  \   +----------+  \  +-------------+ \  +----------------+
               \                 \                  \ +----------------+
                \  +----------+   \ +-------------+   >| fujitogrp.com |
                 ->| explain  |--->| field_diffs |     +----------------+
                   +----------+    +-------------+     +----------------+
                                                       | +112 emails    |
                                                       +----------------+
```

Nodes: white, 1px `--hairline`, 3px radius, min 96px wide, 24px tall, type glyph plus mono-sm label,
a divided count segment on aggregates. Edges: 1px bezier, `--ink-tertiary` at 35 percent. Background
a 24px dot grid at 30 percent. Max 40 nodes; past that the widest layer collapses into an aggregate.

Four artefacts per answer in a fixed order: **result graph, prose, SQL, result table.** The prose is
the shortest of the four and is full of inline chips. The SQL is never collapsed by default: showing
the query is the product's answer to "did it make that up", and hiding it wastes the strongest trust
signal on the screen.

## 4.6 The Earth

A globe (orthographic, drag to rotate) with a flat Web Mercator alternative, showing every loading
and discharge port and the lanes between them.

Light earth: ocean `--canvas`, land `--surface-sunken`, coastline 1px `--hairline-strong`, country
borders 1px `--hairline`, no basemap labels at all. No atmosphere glow and no terminator: those are
dark mode devices that look like costume in a light theme.

Ports are squares sized in four steps by shipment count, filled by worst status. Lanes are great
circle arcs, 1px `--ink-tertiary` at 35 percent. **Small squares travel along each lane from loading
to discharge port.** This is the one permitted looping animation outside the live dot, because there
the animation is the data: it carries direction, which a static arc cannot, and volume, which a
static arc can only carry by thickening. Capped at 120 dots, evenly phased at load so it never
pulses in unison, constant 90px per second in screen space, and replaced by static directional
arrowheads under reduced motion.

A scrubber docked at the bottom **replays the run**: drag and the ports and lanes show only what had
completed by that instant. A barcode strip of 1px rules underneath, one per completed email at its
completion time, amber where that email was a mismatch.

---

# 5. STAGE 1, your brief now

## The screen

**The run detail, live.** A run is one replay of the mailbox through the pipeline. This screen is
what a judge sees first and what the team watches all morning. It exercises more of the system than
any other screen, so whatever you decide here propagates everywhere.

It must contain, in whatever arrangement each variation argues for:

1. Run identity and controls: run id, live state, the pinned prompt versions, pause, cancel, and a
   `Submit run` primary action.
2. Pipeline progress across the eight stages, with counts.
3. Run statistics: finished of total, elapsed, model calls, verifier share, open reviews, tokens,
   cost.
4. Category mix and review reasons.
5. **Working now:** the model calls currently in flight, each with a live dot and its answer
   streaming in as raw JSON, truncated. This is the most persuasive element on the screen. A judge
   can watch the model writing.
6. A live feed of completed model calls: elapsed time from run start (`+12.4s`, not a wall clock),
   step, email, model alias, latency, cost.
7. The email table with filters, showing at least: id, sender, subject, category, confidence, the
   **spine strip**, and outcome.
8. The last score against the previous run's score.

Use the real numbers from section 2. Show at least one `MISMATCH` row, one `NEEDS_REVIEW` row and
one `SPAM` row in the table.

## The three variations

They must differ on **what the screen is for**, not on button radius. All three use the identical
token set, the identical type scale and the identical data. If I can tell them apart only by
spacing, you have failed the brief.

**A. Console.** The run leads. Maximum density, closest to an observability tool or a trading
terminal. Everything is a table or a strip. The live feed is large and permanent. Optimised for the
engineer and for the "look at it working" moment of the demo. Assume the user is watching this
screen for four minutes straight.

**B. Atlas.** The ontology leads. The entity rail is prominent with live counts, the inspector is
docked open by default showing whatever is selected, and the dashboard is composed of entity
summaries with search-around affordances visible without interaction. Closest to Attio or Palantir
Object Explorer. Optimised for the argument that this is a knowledge layer, not a job runner.

**C. Briefing.** The findings lead. A small number of large statements at the top, for example
"46 discrepancies across 220 checks. 3 need you.", with the machinery present but secondary and the
email table below the fold. More generous vertical rhythm, still hairlined and still light. Closest
to an operations briefing a team lead reads at 8am. Optimised for the lead and for a judge who wants
the headline before the mechanism.

## What to deliver in stage 1

For each variation:

- The screen at 1440 x 900, fully populated with the real data.
- A one paragraph argument: what this variation claims the screen is for, who it serves best, and
  what it sacrifices. Be honest about the sacrifice.

Then, across all three:

- A short list of the decisions you want me to settle before stage 2, in priority order.

**Then stop.** Do not design a second screen. Do not build a component library page. Do not start on
motion. Wait for me to choose.

---

# 6. STAGE 2, do not begin until I say so

Once I pick a direction, you design the rest of the product against it.

## Screens, in build priority order

```
1   Email trace              the provenance spine, full page. The product's argument
2   Comparison detail        the seven field rows. The product itself
3   Email list               520 rows with histogram facets
4   Review inbox             queue left, case right, actions pinned. Grouped by review_reason,
                             with failures in their own group. Case pane fixed in the order
                             why, evidence, provenance, actions
5   Chat                     conversations left, and per answer: result graph, prose, SQL, table
6   Operations overview      the landing screen, derived from whatever you settled in stage 1
7   Entity page              one shape for every entity type, ending in search around
8   Ontology graph           object types, link types, row counts, built against planned
9   Earth                    globe, lanes, traffic, the run replay scrubber
10  Evaluation               score history, run against run, candidate lessons
11  Command palette          results grouped by entity type
12  Gate                     the password screen. One mark, one input, one button, nothing else
```

Do them in that order and check in after 1 and 2, because those two carry the whole product and
everything after them is easier.

## Motion, specified for motion.dev

Assume [motion.dev](https://motion.dev) (Motion for React). Design the motion, then write it down so
it can be implemented without guessing.

The system is nearly still. That is a brand position: an instrument that jitters is an instrument you
do not trust.

```
hover, press, badge change       120ms   ease-out
panel, inspector, popover open   180ms   cubic-bezier(0.2, 0, 0, 1)
overlay and scrim                200ms
row entering the live feed       160ms   fade plus 4px rise
globe to flat projection morph   400ms   the only transition over 200ms in the product
```

Constraints:

- **Animate `transform` and `opacity` only.** No animating width, height, top, left, or colour on
  anything that repeats per row. Where a layout genuinely changes, use a layout animation
  explicitly and say so.
- **Springs only where a physical metaphor exists**: the inspector sliding in, the scrubber handle,
  a dragged panel divider. Everything else is a tween. Give spring parameters as
  `{ type: "spring", stiffness, damping }`, not adjectives.
- **Two looping animations exist in the entire product** and no more: the live dot (a 6px `--signal`
  circle, 1.6s opacity cycle between 1.0 and 0.35) and the Earth's lane traffic. If you want a
  third, argue for it explicitly.
- **The value-changed wash** is the whole "something happened" language: when a number updates during
  a live run it changes instantly with no count-up, and its row takes a `--signal-tint` background
  that fades out over 600ms.
- **Stagger is allowed in exactly two places**: nodes appearing in the chat result graph as each
  tool returns, and rows entering the live feed. Both are 40ms per item, capped at 6 items.
- **Every animation needs a stated `prefers-reduced-motion` fallback.** Not "disable animation": say
  what the reduced state looks like. The Earth's traffic becomes static directional arrowheads. The
  live dot becomes a solid dot. The wash becomes nothing.

For each screen, deliver a short motion table: trigger, target, properties, duration or spring,
easing, stagger, reduced-motion fallback.

## Interaction, specified

For every interactive component, give all of: default, hover, focus-visible, active, selected,
disabled, loading, error, empty. Missing states are where designs fall apart in implementation.

Per screen, also give:

- **The keyboard map.** At minimum: arrow keys move between table rows, Enter opens the inspector,
  Escape closes it, cmd-K opens the palette. Say what else.
- **What opens the inspector against what navigates.** Click loads the inspector; cmd-click
  navigates; the entity id itself is a link. Be consistent and say where you break it.
- **Optimistic against pending.** Review actions write to a database and re-queue pipeline work.
  Decide which parts of the UI move immediately and which wait, and what the toast says. A toast
  after a correction should name what was written and what was re-queued, for example
  `compare re-queued from triage`.
- **Loading, empty and failure**, using these three treatments and no others:
  - Empty: one line of `small` in `--ink-tertiary`, centred in 96px, plus one quiet button if an
    action resolves it. No illustrations.
  - Loading: skeleton rows matching the real row height and column widths, in `--surface-sunken`, no
    shimmer. Ten rows of skeleton for a table that will hold ten, so the layout does not jump.
  - Failure: a 2px `--verdict-fault` left rail on the region, one plain English line, the error
    string in a mono-xs well, and a `Retry` secondary button. Name the dependency that failed rather
    than saying "something went wrong".

## Building for React, library agnostic

This will be implemented in React. I have not chosen a component library and I may use more than
one. Do not pick one for me and do not design around any library's defaults. Instead, design so that
**any** headless library can be styled into it:

- **Give every interactive component its anatomy in headless terms**: root, trigger, content, item,
  indicator, and so on, the way Radix, Ark, Base UI and Headless UI all describe theirs. A
  dropdown specified as "Root > Trigger > Portal > Content > Item > ItemIndicator" ports to any of
  them in an afternoon. A dropdown specified only as a picture does not.
- **End every screen with a component inventory**: name, props with types, variants, states, and
  which other components it composes. Prefer composable primitives (`Panel`, `PanelHeader`, `Row`,
  `Badge`, `Chip`, `Meter`, `Well`, `Rail`, `StatTile`, `SpineNode`, `SpineStrip`, `FieldRow`,
  `Facet`) over page-specific one-offs. If a component appears on two screens it must be the same
  component with a prop, not two designs.
- **Every value from the scales above.** No magic numbers. A spacing value not in the 4px scale, a
  colour not in the token list and a type style not in the eleven are all bugs.
- **Assume Tailwind and CSS custom properties.** Everything should be expressible as utility classes
  over the tokens. Do not design anything that needs a bespoke CSS file to survive.
- **Keep files small.** The codebase enforces a 200 line limit per file, so design components that
  decompose naturally rather than one 400 line screen component.
- Name states with the enum they represent where one exists, so the design and the database agree:
  a badge variant is `MISMATCH`, not `warning`.

## A last note on judgement

Two things will be tempting and both are wrong.

The first is to make the dashboard beautiful and the comparison row functional. It is the other way
round. The comparison row is where this product either earns a documentation team's trust or does
not, and it deserves more of your attention than anything else in the list.

The second is to reach for colour when a screen feels flat. It will feel flat. That is the point: a
table of 520 emails should be almost entirely grey, so that the seven amber rows in it are
impossible to miss. Restraint here is not minimalism as a style. It is the thing that makes the
findings visible.
