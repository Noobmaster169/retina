# Retina SDOC: Design language

The visual and interaction system for every Retina surface. `01-product.md` says what the
product does. This says what it looks like, why, and how to draw it.

Status: built. Written 2026-09-20 before phase 7, revised the same day after four rounds of design
review on the canvas, and corrected again where phase 7 had to depart from it. The Air token set in
section 4 is `frontend/app/globals.css`; sections 5 to 9 are the Tailwind theme and
`frontend/lib/motion.ts`; the components of section 8 are `frontend/components/ui/`,
`components/shell/`, `components/run/` and `components/email/`. The phase 1 harbour palette is
gone, and section 12's mapping is kept for reading old commits.

What phase 7 did not build, and why, is under the phase 7 entry in `PROGRESS.md`: the database and
ontology pages (phase 10b), every write path (phase 8), the chat's turns and its proposed action
card (phase 10a), and the memory panel (phase 11, and not stubbed).

**The canvas is the picture, this file is the rule.** Eleven artboards at 1440x900 were drawn,
reviewed and signed off:

```
https://claude.ai/artifact/CSbrqYfTwzHpGFLVgKQpUZ
```

Where this file and the canvas disagree about a measurement, the canvas is what was approved and
this file is corrected. Where they disagree about a principle, this file wins, because a board is
one instance and a rule is every instance. What the canvas settled, and what it retired, is
recorded through sections 4 to 12; `docs/phases/phase-07-handover.md` says how to read it.

Companions:

```
docs/design/ontology-patterns.md    the ontology patterns, and the three that were retired
docs/design/screen-blueprints.md    every screen, laid out
docs/design/references.md           the Mobbin board and what to take from each
```

---

## 1. The one idea

**Every number on this screen can be walked back to the line it came from.**

Retina reads a shared shipping mailbox, sorts it, opens the Shipping Instruction and the draft
Bill of Lading on a comparison request, and says which of seven fields differ. It is allowed to
be wrong. It is not allowed to be unaccountable. The product's whole claim on a documentation
team's trust is that any verdict unfolds backwards into the quoted line, the model that read it,
the prompt version that instructed it, and the person who confirmed it.

So the design system has one job above all others: make provenance the most available thing on
every screen, not a detail panel someone can dig for. Everything in section 3 follows from that.

The second idea, which the brief insists on and the interface must hold apart: **a difference and
an uncertainty are not the same event.** `MISMATCH` means the system read both documents and
they disagree. `NEEDS_REVIEW` means the system could not read one of them, or a value was blank.
Collapsing those two into one "problem" colour would be a design bug with a scoring consequence.
Section 4.4 gives them separate hues and separate shapes and never lets them share a badge.

## 2. Positioning

| | |
|---|---|
| Product | Retina SDOC, shipping document verification |
| Design system name | **Manifest**. A cargo manifest lists what is actually on board; to manifest is to make evident. Alternates if the name reads badly: Bearing, Fathom |
| Who uses it | Ops documentation staff at a paper exporter, a team lead, an engineer, and hackathon judges watching a demo |
| Posture | Instrument. Quiet, certain, and only as dense as the job needs. The tool a team already trusts, not a product being sold to them |
| Register | Corporate maritime logistics, read through enterprise data infrastructure. Serious, not severe. Modern, not trendy |
| Theme | Light only. The work is information heavy and the audience is corporate. Dark is out of scope; do not build a dark token set |
| Nearest relatives | Plain, Linear, Attio, Supabase, Mixpanel, Klaviyo. Sentry and Cloudflare Observability for the run page |
| Explicitly not | **Palantir Foundry's density**, which was tried and rejected in review as information overload. Also consumer dashboard gradients, glassmorphism, nautical costume (ropes, portholes, compass roses), AI product purple, rounded pastel cards |

### 2.1 Seven principles

1. **Hairlines, not boxes.** A 1px rule does every separation job in this system. There are no
   cards, no fills used to group things, and one shadow in the entire product (overlays, 4.6).
2. **Colour is vocabulary, not decoration.** Five hues carry meaning and nothing else is coloured.
   If a thing has no verdict, it is neutral. A table of 520 emails should be almost entirely grey.
3. **Numbers are monospace and tabular, always.** Every count, confidence, weight, container
   count, LOCODE, BL number, cost, latency and id. Columns of numbers align on the digit.
4. **The enum is the label.** `BL_COMPARISON`, `NEEDS_REVIEW`, `missing_value`, `gross_weight_kg`
   appear verbatim, in mono, never prettified into sentence case. It is a correctness rule (the
   organisers fix these values) and it is the brand's voice: the product speaks the domain's own
   language and does not translate it down.
5. **Evidence is never one click away.** The source quote ships with the value, in the same row,
   in a well. A field without its quote is an unfinished component.
6. **Density is the courtesy, in a list.** A documentation clerk checking forty drafts wants forty
   rows on screen, not eight. Default row height is 36px, and a list is one column with one row per
   thing. Density is not an excuse to put everything on the page at once: see principle 8.
7. **Motion only where something is genuinely live.** Nothing in the product loops decoratively;
   the one loop is the indeterminate sweep on a stage with no denominator, and section 9 says why.
   Everything else changes in 120ms and stops.
8. **Abstraction over exposure.** The system knows more than the screen should say. A JSON blob, a
   model name, a token count, a dollar cost and a prompt version are true and are almost never what
   the person in front of the screen needs. Show the reading in plain English, the evidence beside
   it, and put the machinery one click away. This principle was learned the hard way: three
   iterations were rejected for showing what the system knew instead of what the reader needed.
9. **A chip carries its own state.** No status dot sits beside a label. The label and the tint are
   the signal. A dot beside a word is decoration standing in for a design decision, and reviewers
   read it as unfinished work.

### 2.2 Voice

- State verdicts. "consignee differs", not "a possible discrepancy was detected".
- Never call a mismatch an error. The system worked. A mismatch is a finding.
- Never show a confidence without its number, and never the number without its scale.
- Never imply arbitration. The product detects symmetric difference: it says the two documents
  disagree, never which one is right. There is no "correct value" field anywhere in the UI, and
  no "fix" button that writes to one side.
- Plain English around the enums, enums verbatim inside them. "2 fields differ: `consignee`,
  `notify_party`."
- No em dashes in any UI copy (house rule). No emoji anywhere.

## 3. The mark

**Concept: an aperture reading a line.**

A square frame, 1px hairline. Inside it a single horizontal rule standing for a line of a
document. The rule is broken in one place, and the break is filled `--verdict-differ`. That is
the product in one glyph: a surface that reads a line and finds the one thing wrong with it.

```
  +-------------+        16px grid, 1px stroke
  |             |        frame:  inset 1px, --ink
  |  ---- ----- |        rule:   y = 50%, 1px, --ink, from 20% to 80%
  |             |        break:  2px gap at x = 46%, filled --verdict-differ
  +-------------+
```

Construction rules:

- Frame is a square with `--r-sm` (3px) corners above 24px, square below.
- At 16px (favicon) the break widens to 3px so it survives.
- One-colour version: the break becomes a gap and nothing is filled. Use for embossing, single
  ink print, and any context where amber is unavailable.
- The mark never rotates, never takes a gradient, never sits inside a circle.

**Wordmark.** `RETINA` set in the UI sans at 600, letter-spacing `+0.14em`, uppercase. The wide
tracking is what makes it read as an instrument nameplate rather than a startup logo. The product
descriptor `SDOC` sits beside it in `--ink-tertiary` at the micro size, separated by a 1px
vertical hairline with 8px of space either side.

```
[mark]  R E T I N A | SDOC
```

Lockups: horizontal (default), mark only (favicon, avatar, loading), stacked (title slide only).
Clear space equal to the mark's height on all sides. Minimum wordmark width 96px.

## 4. Tokens

The palette is called **Air**: a white ground with hairlines, ink at three weights, and five hues
that mean something. It replaces the grey-page palette this file first carried. The inversion is
the visible change: the page is white and the rail is the one step down, not the other way round.
A white page with hairline panels reads calmer at the same density, which is what the review asked
for.

### 4.1 Surfaces

| Token | Hex | Where |
|---|---|---|
| `--canvas` | `#FFFFFF` | the page behind everything, and every panel |
| `--surface` | `#FCFCFD` | the left rail, panel headers, a folded strip, the chat column |
| `--surface-sunken` | `#F6F8FA` | wells, chips, inputs, table headers, the lane pills on the run page |
| `--surface-active` | `#F3F4F6` | selected row, active nav item, a segmented control's off state |
| `--scrim` | `rgba(17,24,39,0.32)` | behind modals and the command palette |

### 4.2 Lines

| Token | Hex | Where |
|---|---|---|
| `--hairline` | `#ECEFF3` | the default 1px rule. Panel borders, dividers, pane edges |
| `--hairline-strong` | `#DDE3EA` | a secondary button's border, the outer edge of the message card |
| `--hairline-faint` | `#F3F4F6` | separators between rows inside an already bordered panel |

### 4.3 Ink

| Token | Hex | Contrast on `--canvas` | Where |
|---|---|---|---|
| `--ink` | `#111827` | 17.6:1 | primary text, primary button fill, interactive default |
| `--ink-secondary` | `#4B5563` | 7.5:1 | labels, secondary text, a row's supporting line |
| `--ink-tertiary` | `#6B7280` | 4.9:1 | metadata that carries information. **The floor for any readable text** |
| `--ink-faint` | `#9CA3AF` | 2.5:1 | placeholder text, a disabled control, a separator glyph. Never information |
| `--ink-inverse` | `#FFFFFF` | | text on `--ink` and on filled dark chips |

**`--ink-faint` fails 4.5:1 and is not allowed to carry a fact.** The canvas uses it in places
that do carry one, mostly timestamps and counts beside a row. Those move up to `--ink-tertiary`
when they are implemented. Treat every `#9CA3AF` on the canvas as a question: if removing that
text would lose information, it is the wrong token.

**Interactive is the accent.** Since phase 13, primary buttons are `--accent` filled, the active
rail item sits on `--accent-tint` in `--accent`, links are `--accent`, and the focus ring is
`--accent`. The accent is signal blue, which already meant "system state"; an active control is
system state a person can see. A selected row stays `--surface-active` with a 2px `--ink` rail.
The verdict hues stay reserved for verdicts.

### 4.4 Verdict hues

The only five colours that carry meaning. Each has a strong value (text, rails, marks) and a tint
(chip backgrounds, row washes).

| Token | Strong | Tint | Contrast | Means |
|---|---|---|---|---|
| `--verdict-match` | `#067647` | `#ECFDF3` | 5.7:1 | `OK`, the two values agree, evidence confirmed, a check passed |
| `--verdict-differ` | `#B54708` | `#FFFAEB` | 5.4:1 | `MISMATCH`, this field differs. **A finding, not a fault** |
| `--verdict-review` | `#6941C6` | `#F4F3FF` | 6.6:1 | `NEEDS_REVIEW`, uncertainty handed to a person, and memory |
| `--verdict-fault` | `#B42318` | `#FEF3F2` | 6.6:1 | the job failed, a dependency is down, a parse threw |
| `--signal` | `#175CD3` | `#EFF4FF` | 6.0:1 | system state: focus, live, running, the path an agent took |

Contrast is against `--canvas`. Each strong value also clears 4.5:1 on its own tint.

Three rules that matter more than the hexes:

- **Amber and violet never appear in the same badge.** A row is either a difference or an
  uncertainty. If a design wants both, it has misread the pipeline: `decide.ts` returns one status.
- **Red is reserved for faults.** A mismatch is amber because the system succeeded at its job. Only
  a failed job, a dependency outage and a destructive confirm go red.
- **Violet does double duty, on purpose.** It marks uncertainty handed to a person, and it marks
  memory: a lesson, a candidate, a correction a person made. Those are the same thing seen twice,
  because every lesson in the system begins as a case a person had to settle.

### 4.10 Kind hues

Seven muted hues, one per business object, added in phase 13 for the Business data pages: the
glyph and name on a card, the header wash of a detail page, a chip in the chat dock's context
strip, a pin on the port map.

| Token | Strong | Tint | Kind |
|---|---|---|---|
| `--kind-company` | `#0F766E` | `#F0FDFA` | a company: shipper, consignee, notify party |
| `--kind-port` | `#0E7490` | `#ECFEFF` | a port |
| `--kind-shipment` | `#4338CA` | `#EEF2FF` | a shipment as one email states it |
| `--kind-vessel` | `#1E3A8A` | `#EFF6FF` | a vessel |
| `--kind-carrier` | `#4D7C0F` | `#F7FEE7` | a carrier |
| `--kind-commodity` | `#9D174D` | `#FDF2F8` | a commodity |
| `--kind-person` | `#57534E` | `#F5F5F4` | a person |

One rule: **a kind hue says what a thing is and never how it was judged.** It never appears on a
verdict chip, a verdict never appears in a kind's tint, and a list of shipments is coloured by
its `disputed` chips (amber) and nothing else. The kind hue is on the name and the glyph, at
most, so a table stays a table.

### 4.5 The marked span

The most distinctive thing the product draws, settled in review and superseding the row-level
colouring this file first described. When two values differ, the difference is marked **at the
word**, on both sides, not by colouring one column:

| State | Drawing | Means |
|---|---|---|
| **marked** | `--verdict-differ` tint fill, 1px solid `--verdict-differ` underline, `#7A3E06` text | the words the judge said differ. The selected field |
| **flagged** | 1px dashed `--verdict-differ` underline, `--verdict-differ` text, no fill | a field that also differs but is not the one being read |
| **agreed** | `--verdict-match` tint fill, 1px solid `--verdict-match` underline | the two texts differ and the judge called them the same thing |
| **quiet** | 1px dotted `--hairline-strong` underline, `--ink` text | a value that was extracted and agreed, written the same way. Present, proved, unremarkable |
| **bare** | `--ink-tertiary`, nothing | document text that no field was read from |

Only the span moves, never the line. A value is `pre` plus `hit` plus `post`, and only `hit`
takes the mark, so the surrounding line stays readable as the document it came from.

**Settled in phase 7, with the user: both sides take the mark.** The earlier rule in this file
was that the SI column stays neutral and only the BL takes amber, so the design never implies which
document is right. That argument is not wrong, and it is answered by the verdict rather than by the
marking: the row says `differ`, never `wrong`, and there is no correct-value field anywhere in the
product. What the neutral column cost was real: a person comparing two documents had to hunt for
the second half of the pair. The canvas marks both, that is what was reviewed and approved, and
`components/email/field-reading.ts` carries one `markOf` used by every screen, so the two cannot
drift.

**Also settled: green stays on a value the judge called the same.** `NANTONG, CHINA` against
`NANTONG, CHINA (CNNTG)` is drawn `agreed` (4.5), which does spend a verdict hue on a non verdict.
It is kept because it is the clearest evidence anywhere in the product that a model judged rather
than a string matched, which is the whole claim the ontology rests on. A field that agreed and
reads identically stays `quiet`; only a judged agreement across different text earns the green.

### 4.6 Hatch

Uncertainty that has no value at all (a blank SI field, a placeholder like `_______ MTS`, an
unreadable page) is drawn as a hatch, not a colour: 45 degree 1px stripes in `--hairline-strong`
at a 5px pitch over `--surface-sunken`. Hazard hatching is an industrial convention and it reads
instantly as "nothing here to compare", which is what `missing_value` means. It is also colourblind
safe by construction, which matters because missing against different is the most consequential
confusion in the product.

### 4.7 Elevation and focus

There are no shadows in Retina except one, so an overlay reads as floating above the plane rather
than cut into it:

```
--shadow-overlay: 0 8px 24px -8px rgba(17,24,39,0.18), 0 1px 2px rgba(17,24,39,0.06);
```

Used by: command palette, dropdown menus, popovers, modals, toasts. Nothing else. Panels, tables,
tiles and the chat column are separated by hairlines alone. There are no gradients.

```
--focus-ring: 0 0 0 2px var(--canvas), 0 0 0 4px var(--signal);
```

An offset ring, never an outline that shifts layout. Visible on `:focus-visible` only. Every
interactive element has it, including table rows and graph nodes.

### 4.8 Bars, not charts

The canvas retired every chart. What survived is the bar: a 4 to 5px rounded rule, one hue, laid
along a row or under a card. A count is a number and a proportion is a bar, and neither needs an
axis.

- **Progress under a card** on the run page: 4px, `--signal` when that stage is live, `--ink-faint`
  when it is done, `--verdict-differ` when it is backing up. A stage counting slots rather than
  finished work sweeps instead of filling: section 9.
- **A share along a row** in the outcomes list: 5px on a `--surface-sunken` track, in the hue of
  the outcome it belongs to.
- **Elapsed in a slot**: a 2px rule along the bottom edge of the row, `#BBD2F5`, showing how long
  that email has held its slot against a typical call.

If a future screen genuinely needs a distribution, use one hue and a hairline baseline, label
directly, and no gridlines, no donut, no 3D, no area fill under 30 percent. The two ramps this
file used to define are gone: nothing in the product now needs five shades of one hue.

### 4.9 Category is not a colour

The five categories are **not** coloured. A category is a neutral mono chip: `BL_COMPARISON` in
`--ink-secondary` on `--surface-sunken`. A list of 520 emails coloured five ways is a rainbow
nobody can read, and it spends the hues that status needs.

## 5. Typography

| Role | Family | Why |
|---|---|---|
| Display | **Newsreader** (variable, `opsz 6..72`), weights 400 / 500 | One line per page and nothing else. A serif at the page title is the whole reason this product does not look like every other dashboard. It carries the voice; the rest of the page stays neutral underneath it |
| UI | **Inter** (variable), weights 400 / 500 / 600 | Neutral, excellent at 13px and below, tabular figures, no character of its own to fight the data |
| Data and identifiers | **JetBrains Mono**, weights 400 / 500 | Every id, enum, count, LOCODE, weight and quote. Wider and more legible at 11px than the alternatives, which matters because this product sets a lot of 11px mono |

Fallbacks: `Newsreader, Georgia, serif`, `Inter, ui-sans-serif, system-ui, sans-serif` and
`"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`.

IBM Plex Mono is retired. Geist and Geist Mono were drawn as an alternative pairing on a warm
ground and rejected with it; do not reintroduce either.

### 5.1 Scale

| Token | Size / LH | Family | Weight | Use |
|---|---|---|---|---|
| `display` | 30 / 36 | Newsreader | 400 | the page title. One per screen, never two |
| `display-lg` | 38 / 44 | Newsreader | 400 | a single hero number, such as the run score |
| `title` | 15 / 22 | Inter | 600 | panel titles |
| `heading` | 13.5 / 20 | Inter | 600 | section headings inside a panel |
| `body` | 13.5 / 21 | Inter | 400 | the workhorse, and message body text |
| `body-strong` | 13 / 20 | Inter | 500 | emphasis inside body, a row's primary line |
| `small` | 12.5 / 18 | Inter | 400 | dense rows, secondary prose, button labels |
| `caption` | 11.5 / 17 | Inter | 400 | labels above a value, helper text, metadata |
| `micro` | 11 / 16 | Inter | 500 | the smallest label. Sentence case |
| `mono` | 13 / 20 | JetBrains Mono | 400 | extracted values, a hero id |
| `mono-sm` | 11.5 / 18 | JetBrains Mono | 400 | ids, enums, keys, LOCODEs, table cells |
| `mono-xs` | 10.5 / 16 | JetBrains Mono | 400 | column type badges, quotes, log lines |

Every numeric context sets `font-variant-numeric: tabular-nums`. Never centre a number: right
align in tables, left align inline.

**The uppercase micro label is retired.** This file used to call a `+0.06em` uppercase 11px label
"the instrument signature", and it was the first thing review read as shouty. Labels are sentence
case, 11.5px, `--ink-tertiary`, sitting above their value:

```
Gross weight               caption, --ink-tertiary
131,058                    mono, --ink
```

Uppercase survives in exactly one place: an enum, because the organisers wrote it that way.

### 5.2 Measure

Prose caps at 68 characters. Document text in a well caps at 96 characters and wraps. It never
scrolls horizontally, because a reviewer comparing a quote against its source has to see the whole
line at once.

## 6. Space, shape, density

**Base unit 4px** for spacing: 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64. The canvas was drawn at
1px precision and its exact paddings (11px, 13px, 15px) should be read as intent, not as a grid to
reproduce: snap spacing to this scale and keep the type sizes in 5.1 as given.

**Radius.** `--r-xs 5px` for a type badge or a small tag. `--r-sm 6px` for chips, badges and
menu rows. `--r-md 7px` for buttons, inputs and selected rows. `--r-lg 9px` for panels, wells and
the message card. `--r-xl 10px` for the outer panel on a page and for modals. Table cells and
rails are square. Nothing is ever fully round: the pill and the dot are both gone.

**Row heights.** 27px for a rail item or a queued row, 29px for a secondary list row, 34px for the
default table or slot row, 36px for a grid row, 46px for a two line row, 52px for an entity row,
86px for a mail list item. Pick one per list and never mix.

**Gutters.** Page gutter 24px, 28px on a page whose content is a single wide list. Panel padding
15px. Panel header 44px, no bottom hairline unless the panel scrolls. Gap between panels 16px.

**Borders.** 1px `--hairline` does all separation. 2px appears twice: the left rail on a selected
or flagged row, and the focus ring. Nothing is ever 3px.

**Panels are bordered, not floated.** A panel is a 1px `--hairline` rectangle at `--r-xl` on the
white page. This is the one place the earlier "no cards" rule bent: the message on the email page
is a bordered card on purpose, because the whole design problem there was showing where the sender
stops and Retina starts. A border that means "this is not ours" is not decoration.

## 7. Layout shell

Panes, left to right, each one a hairline apart. Every screen is a variation of this.

```
+--------+----------+--------------------------------+-------------+
| rail   |  list    |  the thing itself               |  chat       |
| 232px  |  300px   |  568px on the email page        |  340px      |
|        |          |  flex everywhere else           |             |
| (56px  |          |                                 |             |
| when   |          |                                 |             |
| closed)|          |                                 |             |
+--------+----------+--------------------------------+-------------+
```

**Left rail, 232px.** The run in context, then one group of destinations, and nothing below them:
the pinned prompt set and dependency health were taken off it as clutter (a dependency that is down
is still named by the banner on the run page). The destinations are the entity types plus the
operations, because putting the entities in the navigation is the cheapest way to say that this
product has a knowledge model and not just a list of emails. Counts sit right aligned in mono.

The rail **collapses to 56px** of glyphs, and the close control lives in its header. A screen that
needs width takes it: the documents view is drawn with the rail closed and the message folded to
one line. Every page must work at both widths.

**Top bar, 56px.** The breadcrumb is the ontology path, not a page path, and every segment is a
live entity chip:

```
Database  /  core  /  emails            Runs  /  044367f9
```

Right side: search, and the state of the thing being looked at as a tinted chip with no dot.

**The right pane is the chat, 340px.** This replaces the inspector this file first specified. The
argument for the inspector was that selecting anything anywhere opens the same panel; the argument
that won is that a person looking at a wrong verdict wants to say so, and a read only panel cannot
take that sentence. The chat holds what the inspector held (the reading, how it was sorted, what
the files turned out to be) and then lets the person answer it.

Chat anatomy, top to bottom: the title and a New control; a row of scope chips naming exactly what
this conversation can see (`email_004`, `2 documents`, `6 calls`, `17 memories`); the turns; **the
proposed action, drawn before anything is written**; then the composer with two suggestion chips.

**The proposed action is the component that makes the chat honest.** It names the action kind and
its target in mono (`correct_field`, `notify_party`), shows was and is, says in one sentence what
writing it will do and what it will teach, and offers `Apply and remember` against `Just this
once`. Nothing is written to `review_actions` until that button is pressed.

Responsive: below 1280px the chat becomes an overlay sheet from the right. Below 1024px the rail
collapses to glyphs. Below 768px this is a read only view: list and detail only, no graph, no
table wider than four columns. Retina is a desk tool and the design should admit that.

## 8. Component index

Full specs in `docs/design/screen-blueprints.md` section 14. The distinctive ones, in brief:

| Component | The one thing that makes it Retina |
|---|---|
| **Field comparison row** | The difference is marked at the word on both sides (4.5), never by colouring a column. Collapsed it is one line: name, a plain English verdict, nothing else. Expanded it shows both values and the judge's sentence |
| **The seam** | A labelled rule that says where the sender stops and Retina starts. An icon, the sentence, and a hairline to the right edge. The email page is unreadable without it |
| **Message card** | The email in a 1px `--hairline-strong` box at `--r-lg` with its own header strip, body and file chips. The only bordered card in the product |
| **Proposed action card** | Section 7. The chat's write path, shown before it writes |
| **Lesson card** | A step badge in mono, the lesson in one or two sentences, where it came from, and either Approve and Reject or a shipped version string |
| **Slot row** | One row per email holding a queue slot: id in mono, what it is doing in words, elapsed, and a 2px rule along the bottom for how long it has held it |
| **Verdict chip** | Tint background, strong text, the enum verbatim in mono, `--r-sm`, 21 to 26px tall. No dot |
| **Entity chip** | A 10px type glyph plus label, neutral. Hover reveals a popover after 400ms; click opens the record |
| **Type badge** | A 15px `--surface-sunken` tag in `mono-xs` carrying a column's type: `pk`, `abc`, `123`, `date`, `enum` |
| **Evidence well** | `--surface-sunken` or a 2px left rule, `mono-xs`, never truncated mid quote |
| **Search around** | A list of link types with a count each, so every record is an exit into the rest of the model. `ontology-patterns.md` section 2.6 |
| **Written these ways** | The list of spellings the field judge accepted as one thing, each with how often it was seen and how it was judged. The ontology's argument in one component |
| **Where it sits** | A guide-ruled tree of a record's links, one level of indent per hop |

## 9. Motion

The system is still. An instrument that jitters is an instrument you do not trust.

| Event | Duration | Easing |
|---|---|---|
| Hover, press, chip change | 120ms | `ease-out` |
| Panel, sheet, popover open | 180ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Overlay and scrim | 200ms | same |
| Row entering the live feed | 160ms, fade plus 4px rise | `ease-out` |

**Nothing loops, with one exception.** The pulsing live dot this file used to specify is gone
with every other dot. Live is drawn structurally: a card that is working takes a `--signal` 1px
border, and a row that is working takes the 2px elapsed rule along its bottom edge, which grows
against a real clock rather than stepping on the poll.

The exception, settled in phase 7 with the user: **a stage whose progress has no denominator gets
an indeterminate sweep.** "8 of 8 slots busy" is not a fraction of anything finished, and a
determinate bar there draws a number that does not exist. A 32 percent segment sweeping the track
over 1500ms says "working" and claims nothing, which is the honest drawing. A stage that does have
a denominator (`136 of 220 checked`) keeps its determinate bar, and that bar glides over 1100ms so
it is still moving between two second polls rather than settling in 300ms and waiting.

The rule this leaves is narrower than "nothing loops" and is the one that was meant: **nothing
loops decoratively.** A loop that encodes "there is no number here" is carrying information; a
pulse beside a word that already says `Running` is not. Under `prefers-reduced-motion: reduce` the
sweep becomes a filled track, which says the same thing without moving.

**The value changed wash.** When a number updates during a live run it does not count up and does
not animate. It changes instantly, and its row takes a `--signal` tint background that fades out
over 600ms. That is the entire "something happened" language, and it works at any refresh rate.

`prefers-reduced-motion: reduce` removes the wash and keeps the value change.

## 10. Accessibility

- Every meaning colour carries is also carried by a word. A verdict chip always holds its enum
  text. A marked span always carries an underline as well as a tint, so the difference survives
  without colour: solid for the field being read, dashed for another that differs, dotted for one
  that agreed.
- Hatch instead of colour for missing values (4.6), which makes the most confusable pair in the
  product (missing against different) safe for every form of colour vision deficiency.
- Minimum body contrast 4.5:1, verified in 4.3. `--ink-faint` is the only token below it and is
  never allowed to carry information. The canvas breaks this in places and 4.3 says how to fix it.
- Every table row is a link and is keyboard reachable. Arrow keys move between rows, Enter opens
  the inspector, Escape closes it.
- The graph canvas and the map both have a table equivalent reachable by keyboard, and that table
  is the accessible source of truth. Neither is ever the only route to a fact.
- Live regions announce run milestones, not every row.
- Target size 24px minimum for any control, 32px for anything in the review action bar.

## 11. Anti-patterns

Each of these is something a well meaning designer does by default, and each one breaks the
language. The first five were each drawn, reviewed and rejected during the four rounds that
settled this design; they are not hypothetical.

- **A status dot beside a chip or a row.** Section 2.1, principle 9. The single most common note
  in review.
- **A JSON blob on screen.** A classification, a trace, a detail object: none of them are read as
  JSON by anyone. Render the fields, or say the sentence.
- **A model name, a token count or a dollar cost in the working UI.** True, and not what the reader
  needs. They belong on the run page's own machinery view and nowhere else.
- **A two column grid of small boxes** where a list would do. One column, one row per thing.
- **An empty state made of dashed placeholders.** When there is nothing to show, say what is
  happening and spend the space on what matters now. The held queue on the trouble board is the
  worked example.
- A card with a shadow. There is one bordered card in the product and it is the message; everything
  else is a panel with a hairline.
- Colouring the category column. Section 4.9.
- Red for a mismatch. Section 4.4.
- A percentage bar for confidence. A confidence is a number beside the thing it qualifies.
- Prettifying an enum into sentence case. Section 2.1, principle 4.
- A "correct this value" button that writes to one document. The product never arbitrates. A
  correction records what a person says the value is; it never declares one document right.
- A hero number with no unit and no scale.
- Purple gradients, sparkle glyphs, or any other visual marker of "this part is AI". The whole
  product is AI. Marking it is noise, and it undercuts the claim that this is infrastructure.
- Animating a number upward on a live counter.
- A determinate bar on a stage with no denominator. It draws a proportion of nothing; section 9.
- A second gate, a second nav pattern, or a second table style.

## 12. Migrating the current tokens

`frontend/app/globals.css` today carries the light "harbour" palette from phase 1. Phase 7
replaces it. The mapping, so a mechanical pass can land first and the semantics after:

| Current | Becomes | Note |
|---|---|---|
| `--paper` `#eef1f4` | `--canvas` `#FFFFFF` | the page is white now; `--surface` `#FCFCFD` is the rail |
| `--surface` `#ffffff` | `--canvas` `#FFFFFF` | the name moves: panels are the page |
| `--ink` `#14213d` | `--ink` `#111827` | less blue, more contrast |
| `--muted` `#5e6b7c` | `--ink-secondary` `#4B5563` | plus `--ink-tertiary` and `--ink-faint` |
| `--line` `#d5dbe3` | `--hairline` `#ECEFF3` | plus `--hairline-strong`, `--hairline-faint` |
| `--sel` `#e2e9f1` | `--surface-active` `#F3F4F6` | |
| `--accent` `#0e7c86` | no direct equivalent | interactive becomes `--ink`; `--signal` covers focus and live |
| `--accent-ink` `#0a5a61` | no direct equivalent | as above |
| `--font-plex` IBM Plex Sans | Inter for UI | Plex Sans retires |
| (no display face) | Newsreader | new, and the most visible change on any page |
| (no mono) | JetBrains Mono | IBM Plex Mono was specified here and never shipped; it retires unused |

The `text-red-700` used today for failed stages becomes `--verdict-fault`.

Tailwind is the implementation, per the frontend rules in `CLAUDE.md`: these tokens go into
`globals.css` as CSS variables and into the Tailwind theme, and every screen is built from utility
classes. Nothing in this file authorises a second stylesheet.

## 13. Handover

`docs/phases/phase-07-handover.md` is the working instruction for whoever builds this. It says how
to read the canvas, what the API does not return yet, and what to leave out of phase 7. Read it
before the phase 7 spec.

Read next, in this order:

1. The canvas, board by board. It is the approved picture and it is specific.
2. `docs/design/screen-blueprints.md` for each screen's layout and component list.
3. `docs/design/ontology-patterns.md` for entity chips, search around, the record and the graph,
   and for the three patterns that were retired.
4. `docs/design/references.md` for the Mobbin board, each reference annotated with what to take.

Build in this order:

```
1  tokens                    colour, type, space
2  the shell                 rail, top bar, the collapse
3  the run page              the two queues, and its three states
4  the message and the seam  where the sender stops
5  the field comparison row  the product in one component
6  the tables and the record where a user actually lives
7  the chat rail             phase 10, drawn now so the space is reserved
```

The first five carry everything else: a build that has those and nothing more is already a
coherent product. The chat comes last because it depends on phase 10, and the review actions it
proposes depend on phase 8. Draw the column from the start anyway, so the page is not relaid out
twice.
