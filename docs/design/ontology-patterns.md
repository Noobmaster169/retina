# Retina SDOC: Ontology patterns

How the knowledge model is drawn. `../05-design.md` gives the tokens; this gives the patterns that
make the ontology visible rather than claimed.

**Revised 2026-09-20 against the canvas** (`https://claude.ai/artifact/CSbrqYfTwzHpGFLVgKQpUZ`).
Two patterns here were drawn and kept, three were drawn and cut, and one was never drawn:

| Section | Status |
|---|---|
| 0. The entity vocabulary | **Kept.** Extended: a port and a party are sets of spellings the field judge joined, and the canvas draws that working |
| 1. Provenance spine | **Cut.** See below |
| 2. Entity chips, relation grouping, search around | **Kept.** `step out from here` on the entity view is 2.6 built |
| 2.7 Histogram facets | **Cut.** See below |
| 3. Chat result graph | **Not drawn.** Phase 10a. Nothing contradicts it |
| 4. Earth view | **Not drawn, optional.** Phase 10c |
| 5. Ontology graph | **Kept**, and now the best candidate for a third ontology tab |

**Why the provenance spine was cut.** It drew an email's life as a vertical rail of markers, at
three densities, including a 60px strip meant to sit in every row of the email table. Three
problems: the geometry never reconciled (seven 7px markers with 4px gaps do not make 60px), it
drew eight stages where the code has two queues and seven `Stage` values, and at row density it was
a row of dots, which is exactly what section 2.1 principle 9 of the design language now forbids.
What it was for survives in better form: the run page shows where work is (`screen-blueprints.md`
section 3), and the email page shows how one email was decided, in words, above the check.

**Why histogram facets were cut.** A filter that shows the shape of what it filters is a good idea
and it is the right idea for a different product. Here it put a distribution above every list, on
a page whose whole review note was information overload. Filters are plain controls now. If the
shape of a distribution is genuinely wanted, it belongs on an analytics page that does not exist
yet, not above a list someone is trying to read.

Nothing else in this document changed. Where it names a colour or a type token, read the new value
from `../05-design.md` sections 4 and 5: the palette and the type pairing both moved.

---

## 0. The entity vocabulary

Everything Retina stores is one of these types. The glyph, not the colour, carries the type. All
glyphs are drawn on a 10px grid at 1.25px stroke, in `--ink-tertiary` by default and `--ink` when
the chip is hovered or selected.

| Type | Table | Glyph |
|---|---|---|
| Run | `runs` | filled triangle pointing right |
| Email | `emails` | rectangle with a V from the top corners |
| Attachment | `attachments` | rectangle with the top right corner clipped |
| Document | `documents` | rectangle with three short horizontal rules inside |
| Classification | `classifications` | three stacked bars of decreasing width |
| Extraction | `extractions` | rectangle with one rule pulled out to the right |
| Field | `extraction_fields` | a pair of square brackets |
| FieldDiff | `field_diffs` | two short horizontal bars, offset left and right |
| Comparison | `comparisons` | two vertical bars with a gap between them |
| ReviewCase | `review_cases` | square with a single diagonal hatch line |
| ReviewAction | `review_actions` | a check mark inside a square |
| ModelCall | `llm_calls` | a small diamond |
| PromptVersion | `prompt_versions` | a diamond with a horizontal rule through it |
| Client | `clients` | filled square |
| Party | `parties` | square with a notch cut from the top edge |
| Port | `ports` | hexagon |
| Carrier | `carriers` | chevron pointing right |
| Shipment | `shipments` | square with a vertical rule at one third |
| Submission | `submissions` | upward arrow meeting a horizontal line |

Drawing notes: nothing in the set is a circle, because circles are reserved for the live dot and
avatars. Nothing is filled except Run, Client and the FieldDiff bars, so a dense table of glyphs
stays quiet. The four entity types not yet in the schema (Party, Port, Carrier, Shipment) are
designed now because the map and the chat graph need them, and because designing the ontology
navigation around only the built types would understate the model.

---

## 1. Provenance spine (cut, kept for the record)

The component that carries the product's one idea. A vertical chain showing how a verdict was
reached, in fixed pipeline order, where every node expands into its own evidence.

### 1.1 Geometry

```
 x=0        x=11                                                     right edge
 |           |                                                            |
 |    [#]----+--- Classified        BL_COMPARISON  0.93  sonnet  v3   >   |   36px min
 |     |                            the sender asks for the draft BL...   |
 |     |                                                                  |
 |    [#]--- Parsed                 2 documents  0 unreadable          >   |
 |     |                                                                  |
 |    [#]--- Typed                  SI 0.99   BL 0.98                 >   |
 |     |                                                                  |
 |    [#]--- Extracted              14 values  14 with evidence        >   |
 |     |                                                                  |
 |    [!]--- Judged                 5 same   2 different               >   |
 |     |                                                                  |
 |    [!]--- Decided                MISMATCH  consignee notify_party   >   |
 |     |                                                                  |
 |    [ ]--- Reviewed               open                               >   |
```

- Rail: 1px `--hairline`, at x = 11px.
- Marker: 7px square, centred on the rail, vertically centred on the node's first text line.
- Node: min-height 36px, `padding-left: 28px`, 12px vertical padding when a summary line exists.
- Stat cluster: right aligned, mono-sm, `--ink-tertiary`, 12px gaps. Confidence, model alias,
  prompt version, latency, cost, in that order, each omitted when absent.
- Expand chevron: 16px, far right, rotates 90 degrees on open in 120ms.

### 1.2 Marker states

| State | Marker |
|---|---|
| Complete, nothing found | 7px square filled `--ink` |
| Complete, produced a finding | 7px square filled `--verdict-differ` |
| Escalated here | 7px square filled `--verdict-review` |
| Failed here | 7px square filled `--verdict-fault` |
| Running now | 7px square, 1.5px `--signal` outline, unfilled, with the live dot 12px right of the label |
| Not started | 7px square, 1px `--hairline-strong` outline, unfilled |
| Skipped on purpose | 3px dot, `--ink-disabled`. Used for a verifier that did not need to run |

The rail between two markers is `--hairline` by default. The segment **entering** a finding node
takes that node's verdict colour. The segment after a failure is `--hairline-faint`, because
nothing downstream ran. A reader scanning only the rail can see where the story turned.

### 1.3 What each node reveals when expanded

Fixed content per step. Nothing here is free form.

| Node | Expanded content |
|---|---|
| **Ingested** | sender, subject, attachment filenames as Attachment chips, the body in a well, capped at 12 lines with a "show all" |
| **Classified** | generator rationale in a well, confidence meter, final category badge, `decided_by` chip. If the verifier ran: its counter-cases in a second well, its verdict, and whether it overrode |
| **Parsed** | one row per document: format, page count, `scanned`, OCR confidence, warnings as a list. Link to the extracted text and, for a PDF, the rendered page images |
| **Typed** | the model's `doc_type` with confidence and rationale, beside the filename's claim. When they disagree, the filename claim renders struck through with a `claimed` micro label, never deleted |
| **Extracted** | the seven fields for each document as micro over mono pairs, each with its evidence well. Fields that failed the evidence check carry an `evidence_failed` chip and the verifier's second reading below |
| **Judged** | seven field comparison rows (section 10 of the blueprints), one per field, in enum order |
| **Decided** | the status badge, `defect_fields` as Field chips, `review_reason` if any, and the derived submission row in mono |
| **Reviewed** | the review case, then every action oldest first: kind, field, old value, new value, note, actor, timestamp |

### 1.4 Three densities

The same spine appears at three sizes, and they must be recognisably the same component.

**Full.** The email trace page. Every node, all expandable, deep linkable by anchor
(`#step-extracted`). Arrow keys move between nodes, Enter expands, Escape collapses.

**Collapsed.** Inside the inspector, 400px wide. Shows the current node expanded and one neighbour
either side collapsed, with `3 earlier steps` and `2 later steps` as affordances that scroll the
full spine into the primary pane rather than expanding in place.

**Strip.** A horizontal mini spine for a table row, 60px wide:

```
[#][#][#][#][!][!][ ]
```

Seven 7px markers, 4px gaps, same state colours, no labels. In a 520 row table this gives per row
pipeline state and the location of any finding in 60px of column. Tooltip on hover names the step.
This is the highest value small component in the system: it makes a list of emails read as a list
of processes.

### 1.5 Rules

- Order is the pipeline's order, always, even when a step was skipped. A skipped step keeps its
  slot with a dot marker. The spine's shape is constant across every email, which is what lets a
  reader compare two of them at a glance.
- A node never summarises a model's reasoning in the designer's words. It shows the stored
  rationale or nothing.
- Cost and latency are always available on the node, never hidden behind the expand.
- The spine is read only. Actions live in the review action bar, not on the spine.

---

## 2. Entity chips

Ontology as connective tissue. Every typed value in the product is a chip, so the graph is
traversable from anywhere without a graph ever being drawn.

### 2.1 Anatomy

```
+---------------------------+
| [glyph]  email_004        |     20px tall, radius 3px
+---------------------------+     bg --surface-sunken, border 1px --hairline
   10px    4px  mono-sm --ink
   gap
```

With a count segment, used when the chip stands for a set:

```
+----------------------------------+
| [glyph]  Documents  |  2         |    1px --hairline divider, count mono-sm --ink-tertiary
+----------------------------------+
```

### 2.2 Variants

| Variant | Treatment | Where |
|---|---|---|
| Default | background, border, glyph, label | tables, inspector relation lists, breadcrumb |
| Inline | no background, no border, glyph plus label with a 1px underline | inside prose, chat answers, rationale text |
| Dense | no background, glyph plus label only | inside an already dense table cell |
| Counted | default plus a divided count segment | relation groups |
| Ghost | `--ink-disabled` glyph and label, no border | an entity referenced but not present in this run |

### 2.3 Interaction

- **Hover**: background to `--surface-active`, border to `--hairline-strong`, label underlines.
- **Hover held 400ms**: popover, 280px, `--shadow-overlay`, `--r-md`. Contents: type glyph and id
  in the header; up to three headline stats as micro over mono; up to three relation groups as
  counted chips; an `Open` action. The popover never contains a second popover trigger.
- **Click**: loads the entity into the inspector. Does not navigate.
- **Cmd or Ctrl click**: opens the entity's own page in a new tab.
- **Keyboard**: chips are in tab order inside prose and inside the inspector, not inside table
  cells (the row is the target there).

### 2.4 Relation grouping

The inspector's relations section groups by type, sorts groups by the ontology order in section 0,
and shows at most three chips per group followed by `+N more` which expands the group in place.
A group with zero members is omitted entirely, never rendered as an empty state.

```
RELATIONS

Documents      2      [doc] email_004_SI.txt   [doc] email_004_BL.txt
Fields         14     [fld] shipper   [fld] consignee   [fld] notify_party   +11 more
Diffs          2      [dif] consignee   [dif] notify_party
Model calls    11     [cal] classify   [cal] doc-type   [cal] extract   +8 more
Client         1      [cli] algurg.ae
```

### 2.5 Rules

- A chip's label is the entity's natural key, verbatim: `email_004`, `email_004_BL.txt`,
  `gross_weight_kg`, `algurg.ae`, `CNNTG`. Never a prettified title.
- Chips are neutral. A chip never takes a verdict colour. If the entity has a verdict, a separate
  verdict badge sits beside the chip.
- The breadcrumb in the top bar is a row of chips with `/` separators, and it is the canonical
  demonstration of the pattern. A judge who clicks a breadcrumb segment and watches the inspector
  change has understood the ontology without anyone explaining it.

### 2.6 Search around

Chips let a reader step one link at a time. Search around lets them step a whole link type at
once, and it is the cheapest way to make a relational schema feel like a graph. Lifted almost
directly from Vertex, minus the multi hop builder, which this dataset does not need.

It lives at the bottom of the inspector, under the relations list, as a single control:

```
SEARCH AROUND  email_004

  Documents            2    >
  Fields              14    >
  Diffs                2    >
  Model calls         11    >
  Client               1    >
  Same client, mismatched  6    >
  Same POD, mismatched     3    >
```

- Each row is a link type, its result count in mono, and a chevron. Clicking replaces the primary
  pane with that object set as a table, and pushes a breadcrumb segment so the path back is the
  ontology path.
- The last rows are **derived traversals**, not raw foreign keys: two or three hops that a
  documentation clerk would actually want. `Same client, mismatched` is
  `email -> client -> emails -> comparisons where has_defect`. Those are the rows that make this
  feel like a knowledge tool rather than a schema browser, and there should be at most three of
  them per entity type, each hand chosen.
- A link type with zero results renders in `--ink-disabled` and is not clickable. It still
  appears, because knowing there are no diffs is worth a row.
- The resulting object set carries a header naming how it was reached
  (`14 Fields, from email_004`), and that header has a `Save as view` action.

**needs API.** No route returns a link type census for an entity. One `GET /ontology/:type/:id/around`
returning `[{ linkType, label, count }]` covers the whole pattern.

### 2.7 Histogram facets (cut, kept for the record)

Beside search around, the other Vertex idea worth stealing: a filter that shows the shape of the
property it filters on, with live counts, so choosing a filter is also reading the distribution.

Retina's filter bar drops down into facets rather than plain selects:

```
CATEGORY                          CONFIDENCE                REVIEW REASON
[x] BL_COMPARISON   220 |||||||   0.5 .                     [ ] unreadable        5 |
[ ] SI_REQUEST      125 |||||     0.6 .                     [ ] wrong_doc_type    5 |
[ ] INVOICE_QUERY    75 |||        0.7 ||                   [ ] missing_attach    5 |
[ ] GENERAL          60 ||         0.8 |||                  [ ] missing_value     5 |
[ ] SPAM             40 |          0.9 ||||||||||||
```

- Bars are 1px tall rules in `--ink-tertiary`, scaled to the largest bucket in the facet. Not
  charts: rules. They cost nothing and they read instantly.
- Counts are mono, right aligned within the facet.
- Selecting a value narrows every other facet's counts, and a narrowed facet shows the new count
  in `--ink` with the unfiltered count following in `--ink-disabled`.
- Confidence is bucketed at 0.1, and the bucket containing `VERIFY_BELOW` carries a 1px
  `--signal` rule above it marking the verifier threshold. A reader can see at a glance how much
  of the run sat near the line.

This turns the email list's filter bar into the second best explanation of the dataset in the
product, after the spine.

---

## 3. Chat result graph

What the agent actually touched, drawn beside what it said. This is the screen that answers "how
do I know it did not make that up", and it is the strongest 20 seconds of the demo.

### 3.1 Placement

Above the agent's prose answer, in a panel 240px tall with a 44px header, collapsible and
collapsed by default on a follow up turn. Below the prose sits the SQL block, and below that the
result table. Three artefacts per answer, in this order: **what it touched, what it ran, what came
back.** The prose is the smallest of the four.

### 3.2 Layout

Layered left to right, deterministic. A Sugiyama style layered layout, not a force simulation.
It settles once and freezes. No physics, no jitter, no drift while the user reads.

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

- Node: white, 1px `--hairline`, `--r-sm`, min 96px wide, 24px tall, 8px horizontal padding.
  10px type glyph, 6px gap, mono-sm label. Aggregate nodes carry a divided count segment.
- Column gap 64px, row gap 12px.
- Edge: 1px cubic bezier, `--ink-tertiary` at 35 percent opacity, entering and leaving horizontally.
- Background: 24px dot grid, `--hairline` at 30 percent opacity.
- Max 40 nodes. Past that, collapse the widest layer into an aggregate node carrying the count,
  which expands into the inspector rather than onto the canvas.

### 3.3 The live build

While the agent is working, nodes appear as each tool returns, left to right, 160ms fade and 4px
rise each. The node currently being read carries the live dot. When the turn finishes, every node
settles and the graph freezes. Nothing moves again.

This is the moment worth rehearsing for the demo: the judge asks a question and watches the
system's reach across its own knowledge expand in front of them.

### 3.4 Interaction

- **Hover a node**: its ancestry to the question node draws at 100 percent in `--signal`, 1.5px.
  Everything else drops to 20 percent. Reverts on leave.
- **Click a node**: pins that path, loads the entity into the inspector. Click again to unpin.
- **Click an edge**: shows the relation name in a popover (`field_diffs.comparison_id`).
- Pan by drag, zoom by scroll with a 0.5 to 2.0 clamp. A `fit` control in the panel header. No
  minimap: at 40 nodes it is not earned.

### 3.5 The accessible equivalent

Below the graph, a `Sources` list carrying identical content as grouped chips, keyboard
reachable, and it is the accessible source of truth. The graph is never the only route to a fact.
Reference the sources panels in Elicit and Gemini Notebook for the list treatment.

### 3.6 Rules

- The graph shows what the agent touched, never a general map of the ontology. A schema atlas is a
  different screen and must not be confused with this one.
- A node that returned zero rows still appears, with a `0` count segment and `--ink-disabled`
  label. Showing the dead end is the point.
- Never animate an edge as a flowing dash. It reads as decoration and the system has exactly one
  looping animation.

---

## 4. Earth view (not drawn, optional, phase 10c)

The geography is real and already in the data: every comparison carries a `port_of_loading` and a
`port_of_discharge`, clients have countries, carriers have lanes. This is the screen that turns
two of the seven fields into the operation itself, seen from above.

The reference is Palantir Gotham's earth as a common operating picture, and Gaia's panel
structure, brought into a light theme. Two things are taken and one is rejected: take the globe
and the live traffic, take the Layers / Find / Selection / Time panel arrangement, reject the
dark tactical palette entirely. A light earth is harder and it is the right call here, because the
audience is a corporate documentation desk, not a command post.

### 4.1 Data dependency, stated up front

Port coordinates are **not** in the dataset. They come from a static UN/LOCODE gazetteer shipped
with the frontend as a JSON file keyed by LOCODE. Three consequences the design must handle
rather than hide:

- A port whose LOCODE is not in the gazetteer, or whose value carries no LOCODE at all, goes into
  an **Unplaced** list docked under the ranked table, with its raw value shown verbatim. It is
  never dropped, and its position is never guessed.
- Extracted port values are raw strings (`NANTONG, CHINA (CNNTG)`, `NANTONG, CHINA`, `SINGAPORE`).
  The map keys on the LOCODE when the string carries one and on an exact gazetteer name match
  otherwise. Anything else is unplaced. The design must not invent a fuzzy matcher here: the
  product's own rule is that the model reads and the model judges, and a hand written port matcher
  in the frontend would be the same mistake in a new place.
- Routes are drawn as great circles, which is a schematic, not a voyage. No route is claimed to be
  the vessel's actual track, and the legend says so in one line of caption. Retina has no AIS feed
  and must not imply one.

### 4.2 Two projections, one view

| Mode | Projection | For |
|---|---|---|
| **Globe** (default) | orthographic, drag to rotate, wheel to zoom | the demo, the overview, the screenshot. Lanes across the Pacific and the Indian Ocean read as arcs over a sphere rather than as lines that fall off the edge of a rectangle |
| **Flat** | Web Mercator (EPSG:3857), the projection Palantir's Map uses and every tile source expects | working. Dense port clusters in the Malacca Strait and the Gulf are legible, and comparing two regions side by side is possible |

A segmented control in the panel header switches them. The transition is a 400ms interpolation
between projections, which is the one place in the product where a transition is longer than
200ms, because an instant swap between a sphere and a rectangle is disorienting. Under
`prefers-reduced-motion` it cuts instantly.

Data is stored WGS 84 (EPSG:4326) and projected at draw time in both modes.

### 4.3 A light earth

No tile provider and no third party basemap. Full brand control, and the only way a light earth
holds together.

| Layer | Treatment |
|---|---|
| Ocean | `--canvas` |
| Land | `--surface-sunken` |
| Coastline | 1px `--hairline-strong` |
| Country borders | 1px `--hairline` |
| Graticule | 1px `--hairline` at 40 percent, every 30 degrees, off by default |
| Sphere edge (globe only) | 1px `--hairline-strong`, plus a radial inner gradient from transparent to `rgba(15,23,32,0.04)` in the outer 12 percent of the radius |
| Labels | none from a basemap. Every label on this map is Retina's own |

That 4 percent inner vignette is the only gradient permitted anywhere in the product, and it
exists for one reason: a flat circle does not read as a sphere without it. There is no atmosphere
glow and no terminator. Those are dark mode devices and they look like costume in a light theme.

### 4.4 Ports

- Shape: a square, consistent with "squares are records" everywhere else in the system.
- Size: four steps by shipment count, 6px / 9px / 12px / 16px. Stepped, never continuous, so
  sizes are comparable by eye.
- Fill, worst status wins: `--surface` with a 1.5px `--ink` border when every shipment through
  that port is `OK`; `--verdict-differ` fill when any is `MISMATCH`; `--verdict-review` fill when
  any escalated.
- Label: LOCODE in mono-xs, 6px to the right, shown at zoom 4 and above, or on hover at any zoom.
- Clustering: below zoom 3, ports within 24px merge into one square carrying a divided count
  segment, exactly like a counted entity chip. Never a circle with a number in it.
- On the globe, a port on the far side of the sphere is culled, not drawn at 20 percent. Half the
  earth being empty is honest and it is what makes rotating feel like looking at something.

### 4.5 Lanes and traffic

A lane is a POL to POD pair. It is drawn as a great circle arc, 1px, `--ink-tertiary` at 35
percent, rising to 1.5px and `--ink-secondary` when any of its shipments carry a finding.

**The traffic.** Along each lane, small squares travel from the loading port to the discharge
port. This is the one place in Retina where a looping animation is permitted, and the exception is
granted because here the animation is the data rather than decoration: it carries direction, which
a static line cannot, and it carries volume, which a static line can only carry by getting thicker.

| Property | Encodes | Spec |
|---|---|---|
| Dot presence | the lane is active in the current time window | 3px square, `--r-sm` off (square corners) |
| Dot count in flight | shipment volume on that lane | one dot per `ceil(shipments / 4)`, capped at 8 per lane |
| Dot colour | the worst verdict among that lane's shipments | `--ink-tertiary` for all `OK`, `--verdict-differ` if any mismatch, `--verdict-review` if any escalation |
| Dot speed | nothing | constant 90px per second in screen space, so a long lane takes longer and short lanes do not flicker |

Rules that keep it from becoming a screensaver:

- Dots are evenly phased along the lane at load, not released in a burst, so the screen is never
  empty and never pulses in unison.
- A dot fades out over its last 8 percent of travel rather than hitting the marker, which stops
  the eye being dragged to the endpoint on every cycle.
- Total dots on screen are capped at 120. Past that, lanes are sampled by volume, and the legend
  says `showing 120 of 340 in transit`.
- `prefers-reduced-motion: reduce` replaces every dot with a single static filled triangle at the
  arc midpoint, pointing the direction of travel. The information survives; the motion does not.
- A selected lane draws at 100 percent in `--signal` at 1.5px, its dots go to `--signal`, and both
  endpoint markers take the selected state.

### 4.6 The time scrubber

Adapted from Gaia's Time Selection and Series panels, and it is what makes this more than a
pretty map: **the earth replays the run.**

A 64px panel docked at the bottom of the map:

```
+----------------------------------------------------------------------+
| [>]  00:00 ......................................|.......  07:46     |
|      |..|.||.|||.||||.|||||.||||||.|||||||.||||||||.|||||.|           |
|             ^ emails completing, one rule per email                   |
|      classified 312    compared 84    review 3    mismatch 11         |
+----------------------------------------------------------------------+
```

- The x axis is the run's elapsed time, not a wall clock, matching the live feed.
- The strip beneath is one 1px rule per completed email at its completion time, `--ink-tertiary`,
  or `--verdict-differ` where that email was a mismatch. It is a barcode of the run, and its
  density shows throughput without a chart.
- Dragging the handle scrubs. Ports and lanes show only what had completed by that instant, and
  the counts under the strip recount. Playing it back at 8x turns the run into a 60 second film
  of the desk's morning, which is the demo.
- During a live run the handle is pinned to the right edge with the live dot, and new rules append.
- Scrubbing is the only control in the product that changes what every other panel on the screen
  is showing, so it gets a 2px `--signal` handle and a mono readout of the selected instant.

### 4.7 Panels

Gaia's arrangement, reduced to what Retina has data for:

| Position | Panel | Contents |
|---|---|---|
| Left, 260px | **Layers** | Ports, Lanes, Traffic, Graticule, Clients, each a checkbox with a count. Style controls for mode (4.8) |
| Left, 260px | **Find** | Search a port, a LOCODE, a client, or jump to coordinates |
| Bottom left | **Legend** | The active ramp, the traffic key, and the one line caption about great circles |
| Right | **Selection** | This is the standard inspector, not a map specific panel. Same component as everywhere else |
| Bottom | **Time** | Section 4.6 |
| Top left, floating | **Toolbar** | Select, Search around, Fit, Capture. No Draw, no Annotate, no Measure: Retina has no use for them and an unused tool in a toolbar is a lie about the product |

The docked ranked table from the flat map moves into the Layers panel as an expandable section in
globe mode, and returns to a 360px right dock in flat mode where there is room for it.

### 4.8 Modes

A micro segmented control in the panel header:

| Mode | Port size | Port fill | Lane weight |
|---|---|---|---|
| **Volume** (default) | shipments, four steps | worst status | shipments |
| **Discrepancy** | uniform 10px | mismatch rate on the heat ramp `--heat-1` to `--heat-7` | mismatch count |
| **Client** | shipments | the client tier that dominates that port, on the mix ramp | shipments |

### 4.9 The ranked table

The accessible source of truth for everything the earth shows. 360px, and it is never optional:
the map is a second way to read this table, not the only way to read this data.

```
PORT            ROLE   COUNTRY      SHIPMENTS   MISMATCH   RATE
CNNTG           POL    China               34          6   17.6%
SGSIN           BOTH   Singapore           28          2    7.1%
INNSA           POL    India               19          3   15.8%
GNCKY           POD    Guinea              11          1    9.1%
```

Hovering a row highlights its marker and its lanes, and vice versa. Selecting either loads that
Port entity into the inspector, where search around (2.6) runs back into the rest of the ontology:
shipments, clients, carriers, and the field diffs where this port was the field that differed.

Below it, when non empty, the **Unplaced** list: raw value, count, and a `no locode` or
`unknown locode` micro label.

### 4.10 Rules

- The earth is a view of the ontology, not a separate feature. Every selection ends in the same
  inspector as every other selection in the product.
- No drop shadows on markers, no bloom, no 3D extruded bars rising off the globe, no rotating
  idle animation when nobody is interacting. The globe holds still unless someone moves it.
- The traffic animation is the only looping animation outside the live dot, and it is scoped to
  this screen. It does not appear on the overview, in a table, or in a thumbnail.
- The map never shows a port the current filter excludes. Filters are shared with the rest of the
  product, not duplicated here.

---

## 5. Ontology graph

The model itself, drawn once. Documentation rather than a tool, and it earns its place because a
judge who sees it understands in five seconds that Retina has a schema and not a pile of tables.

Palantir's Ontology Manager graph is the reference, and its three decisions are the right ones:
**object type nodes, link type edges, automatic hierarchical layout.** Not force directed, not
hand placed.

```
                      +------+
                      | Run  |
                      +--+---+
                         | has
                    +----v----+  from   +--------+
                    |  Email  +-------->| Client |
                    +----+----+         +---+----+
                         | carries          | tier
                    +----v-------+      +---v----+
                    | Attachment |      | Party  |
                    +----+-------+      +--------+
                         | parsed to
                    +----v-----+  typed as
                    | Document +----------+
                    +----+-----+          |
                         | yields         v
                    +----v-------+   +---------+
                    | Extraction |   | DocType |
                    +----+-------+   +---------+
                         | 7 per doc
                    +----v----+  judged into  +-----------+
                    |  Field  +-------------->| FieldDiff |
                    +---------+               +-----+-----+
                                                    | rolls up to
                                              +-----v-------+
                                              | Comparison  |
                                              +-----+-------+
                                                    | escalates to
                                              +-----v-------+
                                              | ReviewCase  |
                                              +-------------+
```

Spec:

- Node: white, 1px `--hairline`, `--r-sm`, 32px tall, the type glyph from section 0, the type name
  in `body-strong`, and the live row count in mono-sm `--ink-tertiary` beneath.
- Edge: 1px `--ink-tertiary`, orthogonal routing (right angles, not curves, because this is a
  schema not a flow), with the link type name in micro type on the edge.
- A node for a type that is **designed but not yet built** (Shipment, Party, Port, Carrier) renders
  with a dashed 1px border and `--ink-tertiary` label. Palantir's graph does the same thing with
  its `Existing` and `Proposed` status legend, and it is honest: the atlas shows the model as it
  is, with the intent visible.
- A status legend sits bottom left: `built` and `planned`.
- Clicking a node opens that type's entity index (blueprints section 8). Clicking an edge shows
  the foreign key in a popover.
- Beside the graph, a list of the `analytics` views with the `core` tables each derives from, so
  the chat agent's query surface is visible on the same page as the model it queries.

This page is static in the sense that its layout is computed once and does not move. It is the one
screen in Retina with no live data other than the counts.

---

## 6. How they compose

They are one system, and the joins are where the product feels designed rather than assembled:

- A **spine** node's stat cluster contains **chips** (model call, prompt version, document).
- An **inspector** opened from a **port marker on the earth** or a **node in the chat graph**
  shows that entity's **spine** collapsed, so a spatial or conversational entry point lands in the
  same provenance story a table row would have led to.
- Every inspector ends in **search around**, so every one of those entry points is also an exit
  into the rest of the model.
- A **chat** answer's prose contains inline **chips**, and clicking one moves the inspector
  without losing the conversation.
- A table row's **spine strip** and its **chips** are the same seven pipeline steps and the same
  entity vocabulary as the full trace page.
- The **ontology graph** uses the same glyphs as the chips, so the documentation of the model and
  the use of the model share one alphabet.
- The **earth's** time scrubber and the **run's** live feed share one clock: elapsed time from the
  run's start, never a wall clock.

The test for any new surface: can a reader get from it to a quoted line in a document in three
clicks, using only these patterns. If not, the surface is wrong, not the patterns.
