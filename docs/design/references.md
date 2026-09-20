# Retina SDOC: Reference board

**Revised 2026-09-20.** Four rounds of review settled which of these the product actually follows.
**Palantir Foundry is out as a design reference**: it was tried and the result was rejected as
information overload. Its ideas about an ontology stand, and `ontology-patterns.md` keeps them; its
density, its dark chrome and its panel stacking do not. The references that won are Plain (the
thread and the workflow canvas), Linear and Attio (list density, chips without ornament), Supabase
(the table view and the row drawer), Mixpanel (how a flow is drawn left to right) and Klaviyo (an
email shown as an email). Read the notes below with that ranking in mind.


What was looked at, what to take from it, and what to leave. Read alongside `../05-design.md`.

Sources are Mobbin (sections 1 to 9) and Palantir's own public documentation (section 10, because
Palantir is not on Mobbin and is the closest existing thing to what Retina is doing).

**How to use this.** Each entry says *take* and *leave*. The *leave* line matters more than the
*take* line: almost every reference below is a good product that is not this product, and copying
the whole of any of them produces something generic. Nothing here is a template.

**On the images.** Mobbin's high resolution image URLs expire after about 30 days. The links here
are to the permanent screen pages. If images are wanted in a canvas, pull them from Mobbin at the
time of use rather than caching them now.

---

## 1. The shell: rail, three panes, typed record pages

The closest existing shape to Retina's shell, and the strongest section of this board.

| Reference | Take | Leave |
|---|---|---|
| [Attio, company record](https://mobbin.com/screens/cf4f2b49-652f-4c76-8a7c-1ea4f57c10cf) | The whole shape. A left rail with **record types** as first class navigation, a centre activity pane, a right details pane of typed fields. Hairlines only, no cards, no shadows. This is the single most useful reference on the board | The empty-state "Set Description..." placeholders in every field slot. Retina's inspector omits absent fields rather than advertising them |
| [Twenty, company record](https://mobbin.com/screens/7752aca7-8b40-48ab-88d6-9120d16e0a5d) | Field groups under micro headers (`General`, `Business`, `System`), relation sections with inline add, a genuinely quiet light palette | The coloured record avatars. Retina uses type glyphs, not logos |
| [Supabase, observability overview](https://mobbin.com/screens/704ea722-33ea-44f5-ba70-03005b33a9f9) | The best light-mode instrument reference here. Uppercase micro stat labels, hairline bounded tiles, sparkline strips per service, zero decoration | The green accent used for everything. Retina's interactive colour is ink |
| [HubSpot, contact record](https://mobbin.com/screens/f215a882-8c79-4bf8-8483-4d8ae465c3c1) | The activity timeline with expandable entries as the centre of a record page | Everything else. Too many competing panels, too much colour, the AI summary card in a tinted box |
| [Salesforce, lead](https://mobbin.com/screens/c6dc0e4e-5e1e-4391-9923-2e16ac6084d6), [Zoho](https://mobbin.com/screens/7cbc3db6-fbaa-479f-bf30-7518fb2a9fb0), [Pipedrive](https://mobbin.com/screens/eec508ff-3536-4479-bd16-ebf8c5e46d16) | Included as the negative case: three panes of unrelated density, chrome on chrome, blue everywhere | Essentially all of it. These are what Retina must not become as it gains features |

## 2. Dense tables and filtering

| Reference | Take | Leave |
|---|---|---|
| [Shopify, orders with a filter open](https://mobbin.com/screens/9a5dbafc-fc4a-4bfb-9ae4-98b1a61ed95d) | Filter chips that read as a sentence (`Payment status is Paid`), saved views, a sparkline stat strip above the table | The pill-shaped status badges in pastel. Retina's badges are square-ish and carry the enum verbatim |
| [Relevance AI, tasks with a filter panel](https://mobbin.com/screens/7690aff3-4875-4930-9b99-52e52a7f0b07) | Tab counts as the primary filter (`All 17 / To review 4 / Escalated / Errored / Completed 17`). Retina's review inbox borrows this exactly | The filter builder's `Where agent is` form. Retina's filters are facets, not a query builder |
| [Dovetail, contacts grid](https://mobbin.com/screens/4135f677-583f-41f7-a47e-61e07ec6bef4) | Column header treatment, row density, the `Sort / Fields / Filter` trio in the toolbar | The multicoloured tag chips in every cell. This is exactly the rainbow that section 4.9 of the design doc forbids |
| [Hotjar, recordings](https://mobbin.com/screens/ff3024b1-5264-483e-afa7-460a0224ff89) | The selection action bar that floats over the table when rows are checked | Flag icons and the bar-chart-in-a-cell treatment |
| [Juicebox, contacts](https://mobbin.com/screens/cbe1c32c-64a5-4017-b486-89563de632c0) | Compact status selects inline in a cell | The per-row icon cluster |
| [Airtable, grid](https://mobbin.com/screens/0ae70295-bf54-4fb6-958f-d4219de0a9ad) | The typed column header with a type glyph, which is a small idea worth stealing for Retina's tables | Row numbering, the inline image thumbnails, the coloured single-selects |

## 3. Live feeds and log consoles

Feeds the run detail's live pane and the `working now` panel.

| Reference | Take | Leave |
|---|---|---|
| [Cloudflare, Workers observability events](https://mobbin.com/screens/db64bfde-eac6-4786-8c29-62b98eb1a149) | The best of these. Light mode, mono timestamps in a fixed column, a type pill (`log` / `invocation log`), a `Live` toggle, an events histogram above the table that doubles as a time filter. Retina's live feed is this plus cost | The timezone chips on every timestamp. Retina shows elapsed time from run start instead |
| [Supabase, realtime inspector](https://mobbin.com/screens/186221ca-f0df-493e-8064-cfb5c32e742e) | Event rows left, the selected event's payload pretty printed right. Exactly the shape of Retina's live call plus its streaming answer | The dark JSON viewer chrome |
| [Modal, app logs](https://mobbin.com/screens/1f2f0cd1-eadb-435f-9632-116b03a1fc22) | The `Streaming` indicator pinned at the bottom of the list, and the volume histogram above it | Dark theme |
| [Retool, workflow run](https://mobbin.com/screens/391a84fe-1981-4bb8-8417-12103c7958e8) | A block list with per-block timings down the left beside the run log. Good model for the spine's stat cluster | The canvas plus logs plus inspector all at once. Too many panes |
| [Railway, logs](https://mobbin.com/screens/5d9a18b8-0500-44cb-81fc-377da4307131), [Replit, logs](https://mobbin.com/screens/4b69281e-612f-46fb-bb73-2fc5c49b30ef) | Column configuration for a log table; error rows given a tinted full-row background rather than just red text | Dark theme, and Replit's saturated red error block |

## 4. Provenance, audit and trace

The direct references for the provenance spine.

| Reference | Take | Leave |
|---|---|---|
| [Sentry, trace preview](https://mobbin.com/screens/16987d18-5642-44bf-a645-4b326df775a6) | The closest thing on Mobbin to the spine: a nested tree of steps with a proportional duration bar per row, a jump-to bar across the top (`Highlights / Stack Trace / Replay / Breadcrumbs / Logs / Trace / Tags`), tag tables below in two columns | The waterfall's horizontal time axis. Retina's spine is ordinal, not temporal: the stages always occur in the same order and their durations are a stat, not a layout |
| [Customer.io, activity log](https://mobbin.com/screens/a8cabaf8-cf6f-4331-9e8b-98523d4b1776) | Rows that expand **in place** into their raw payload, with a `Source:` line naming what caused the change. Retina's spine nodes expand the same way, and the `Source:` line becomes the source quote | The raw JSON as the expanded content. Retina expands into designed evidence, and shows raw payloads only on the engineering `Calls` tab |
| [Railway, audit log with event drawer](https://mobbin.com/screens/3668d9f6-d6bb-4fdf-a4a8-97087947c044) | The `When / Who / What` sectioning of a single event, and an `Event ID` in mono at the top of the drawer | The drawer pattern itself. Retina uses a persistent inspector, not a drawer that covers the list |
| [Deputy, timesheet history](https://mobbin.com/screens/fd1a02ca-3bc4-47eb-bd05-a63926f531a3) | Field level change rows reading `Cost  90 -> 0`, which is the shape of a Retina `correct field` review action | The modal. Review history belongs in the spine |
| [Mixpanel, event history](https://mobbin.com/screens/54913895-e02f-45fc-a4ca-8f6dd02a8f4a) | `Previous value` and `New value` as a labelled pair, which is the `missing_value` correction pattern | Modal again |
| [Klaviyo, import history](https://mobbin.com/screens/7b815936-117a-4695-8a9b-429403b4c671) | An expanded row summarising results as a short checked list. Good model for the spine's `Parsed` node | The green circled check glyphs |

## 5. Agent answers with their sources

Feeds the chat screen.

| Reference | Take | Leave |
|---|---|---|
| [Gemini Notebook](https://mobbin.com/screens/6c434e95-b9b4-47b3-b4ad-06a9b8e3192a) | The three-pane shape: sources left, chat centre, the extracted data as a real table right, with a `Source` column carrying citation numbers back to the panel. Retina's chat is this with the result graph replacing the sources list | The notebook framing and the `Good content / Bad content` feedback bar |
| [Elicit, research report](https://mobbin.com/screens/358f5d13-4f91-4565-81d4-36e7813fe2ae) | Two things. The **process status list** (`Gather papers 50 found / Screen papers 10 included / Extract data 50 data points / Generate report`), each with a `Details` link, which is a provenance spine by another name. And **inline citation marks on individual claims** in the prose | The academic register and the serif headline |
| [ChatGPT, research with an activity panel](https://mobbin.com/screens/73833b79-1dd5-4354-8fc4-a2e99c33a75e) | The right-hand `Activity / 23 Sources` panel narrating what the agent did as it did it, and the `Research completed in 5m, 23 sources` footer. Retina's result graph is the same promise, drawn instead of narrated | The narrated inner monologue. Retina shows what was touched and the SQL, not a stream of reflections |
| [Customer.io, agent with a references popover](https://mobbin.com/screens/fafcbfb9-fa85-4b4d-b17f-54df962305b5) | `Thought for 26 seconds` and `Searched docs` as collapsed, clickable provenance, plus a `5 references` popover anchored to the answer | The suggestion chips under the answer |
| [Cohere, playground with connectors](https://mobbin.com/screens/a51418f9-3eb4-470b-98cf-eebb757aa0c7) | Citations rendered as inline chips at the end of the paragraph they support, and the visible `Performing multistep reasoning using tools` trace with the rationale and the tool call shown as one line each | The playground chrome and the JSON mode panel |
| [WRITER, agent with a tool panel](https://mobbin.com/screens/87f84b1b-d3cc-49d0-9d9e-4c546573fc56) | Tool invocations rendered as small labelled chips inline in the conversation (`Searching integrations`, `Get data endpoints`, `Plan: Create Task`). Retina's chat uses exactly this for tool calls | The right-hand provider status card |

## 6. Graph canvases

Feeds the chat result graph and the ontology graph.

| Reference | Take | Leave |
|---|---|---|
| [WRITER, blueprint canvas](https://mobbin.com/screens/afef9286-7030-4b12-8b5f-bb2d52831bd7) | The best light-mode graph on this board. Small white nodes with a hairline border, a micro type label, a per-node output count, thin pale curved edges, generous spacing, a fan-out from one classification node that reads instantly. Retina's result graph is this | The faint mint edge colour, and the node checkboxes |
| [Clay, workbook lineage](https://mobbin.com/screens/cc8cfbca-7415-499e-ab62-45e5e0c64c7f) | A **vertical** lineage chain where each node carries its row count and per-row cost (`20 rows, 31 columns`, `4.3 / row`). This is the closest existing thing to Retina's spine drawn as a graph, and it is where the spine's stat cluster comes from | The source-picker rail |
| [Okta, workflow](https://mobbin.com/screens/08d8253b-16a0-4090-8c75-784b80471dd1) | Nodes as small typed tables with named input and output ports | The card colour coding per block type |
| [fal](https://mobbin.com/screens/281cb501-ce68-4719-9cec-d36e7fae0715), [Runway](https://mobbin.com/screens/16aa61e3-22ee-4ce3-be85-054705981f11) | The dot-grid canvas background at low contrast, and the floating toolbar pinned to the bottom centre | The large media cards as nodes |
| [Cofounder](https://mobbin.com/screens/f54f6423-ce18-4844-b335-35878733403b) | An interesting idea, noted and rejected: a faint radial org graph sitting **behind** the working panels as ambient context | Rejected because ambient decoration is exactly what section 11 of the design doc forbids. The graph either carries information or is not on screen |

## 7. Comparison and diff

Feeds the field comparison row.

| Reference | Take | Leave |
|---|---|---|
| [Figma, compare changes](https://mobbin.com/screens/ebb90bf9-735a-4f5f-968a-8152ff58dde8) | Structurally the closest to Retina's comparison: a left list of changed items with `Added` and `Removed` status labels, a side-by-side middle, and a right panel explaining the selected change property by property. Also the `Side by side / Overlay` toggle | The red dashed outlines over the artwork |
| [Semrush, review mode](https://mobbin.com/screens/ed82aafc-c4dc-442d-87fc-359f7347f940) | The best diff treatment here: `Original` and `New` columns with shared line numbers in the gutter, and only the **changed span** tinted rather than the whole line. Retina's quote underline does the same job with less ink | The green and pink full-block tints, and the `Content score 90%` gauge |
| [Google AI Studio, viewing differences](https://mobbin.com/screens/3430ca7f-87b3-4475-ba40-fe8258cf2687) | A file list with change counts above the diff, so a reader sees the scope before the detail. Retina's `5 same, 2 different` node summary does this | The hatched empty block on the removed side. Retina's hatch means `missing`, and reusing it for `removed` would collide |
| [Reddit, comparing revisions](https://mobbin.com/screens/982b86ad-bd93-4e22-8acf-4e8cdba18638) | Included only as the baseline: a plain two-column line diff with a change marker in the gutter | Everything about its density and typography |

## 8. Review and approval queues

Feeds the review inbox.

| Reference | Take | Leave |
|---|---|---|
| [Relevance AI, agent queue](https://mobbin.com/screens/860b4d5d-622b-4dea-81ed-a5582422fa17) | The single closest reference for Retina's review inbox: a queue of agent outputs left, the agent's full reasoning and its `Suggested reply/action` centre, and a selection action bar with `Approve / Rerun / Delete`. `Rerun` is precisely Retina's retry | The green `Approve` button. Retina's primary is ink |
| [Asana, approval task](https://mobbin.com/screens/c7983d8c-ef12-45ec-9a14-ab01affd26d5) | `Approve / Request changes / Reject` pinned at the top of the detail pane, and the visibility notice above the content | The comment thread as the body of the pane |
| [Airtable, record with comments](https://mobbin.com/screens/6db92633-6bad-4f26-b602-cad87e4dfb91) | Status as the leftmost column of the queue table, which makes the list scannable by state | The comment-centric detail panel |
| [ClickUp](https://mobbin.com/screens/fdca2aa1-77b1-4975-bc13-7cbe41227480), [Wrike](https://mobbin.com/screens/20ad47f6-2249-48aa-a3c2-e8fb4503b4b0) | Grouped queues under coloured status headers, with counts | The colour density. Retina groups by `review_reason` under neutral micro headers |

## 9. Maps and command palettes

| Reference | Take | Leave |
|---|---|---|
| [Squarespace, traffic by geography](https://mobbin.com/screens/be6a849b-1fde-42ca-a6f2-f69ffcf4439c) | The right basemap treatment for a light instrument: a fully desaturated grey world with no labels, a single value ramp, and a ranked table directly beneath sharing the same data. Retina's flat mode is this | The near-black country fill at the top of the ramp, which reads as a hole in the page |
| [Profound, prompt volume by region](https://mobbin.com/screens/98b82305-3239-4d52-b0c9-0e7f701dc127) | Map beside a ranked table with a delta column, the two cross-highlighting | The flag emoji in the table |
| [Klaviyo, activity map](https://mobbin.com/screens/9e0750ed-89c5-4296-87cd-44844b5fa846) | The pale grey country outline treatment at rest | Nothing else; it is an empty state |
| [Hootsuite, world map](https://mobbin.com/screens/90b7a597-5de6-4329-928b-81f9427241b6) | The bottom-left banded legend with explicit value ranges | The multi-hue blue-to-magenta ramp, which is two ramps pretending to be one |
| [Hex, map cell configuration](https://mobbin.com/screens/91ef3df1-0142-4ac9-acb2-0734fa43f758) | The layer configuration panel's structure (`Data / Type / Coordinates / Fill / Outline / Size`), which is the right model for Retina's Layers panel | The notebook framing |
| [Vapi](https://mobbin.com/screens/593d7acd-2e16-4365-bcd6-02ce52f48f3b), [Juicebox](https://mobbin.com/screens/2af813bf-0129-45d1-81ed-069edee76e16), [Mintlify](https://mobbin.com/screens/7c7ad31f-9dfe-4be7-83d7-6002fe31d4d0) | Command palettes grouped by section with a keyboard hint footer. Juicebox's `to select / to navigate / Tab to jump sections` footer is the pattern to copy | The dark overlays |
| [Pipedrive, global search](https://mobbin.com/screens/56e9d659-8d30-471b-a641-f00e313dca04) | Results grouped by **record type** with a type list down the left of the overlay. Retina groups by entity type, which is the third place the ontology asserts itself | The category sidebar inside the overlay; Retina groups inline |

---

## 10. Palantir

Not on Mobbin, and the closest existing product family to what Retina is building. Everything
below comes from Palantir's public documentation and marketing site, read on 2026-09-20. **I did
not have access to the products themselves**, so panel names and behaviours below are quoted from
the docs, while the visual notes are inferred from the product screenshots embedded in those docs
pages and from the marketing imagery. Treat the visual notes as weaker evidence than the
structural ones.

One overall finding worth stating plainly: **Gotham's public imagery is dark, tactical and
militaristic, and Foundry's product documentation screenshots are light and quiet.** Retina wants
the second. The dark command-post look is the wrong register for a paper exporter's documentation
desk, and the light Foundry surfaces are both more usable and more original as a reference.

### 10.1 The Ontology, conceptually

Palantir splits the model into a **semantic layer** (object types, link types, properties) and a
**kinetic layer** (action types and functions), plus **interfaces** for polymorphism across object
types that share a shape.

What Retina takes: the split itself, as a naming discipline. Retina's entity vocabulary
(`ontology-patterns.md` section 0) is the semantic layer, and the review actions are the kinetic
layer. Keeping them separate in the language is why the spine is read-only and the action bar is
a distinct component rather than buttons scattered through the trace.

What Retina leaves: the vocabulary itself. Nobody on a documentation desk should have to learn the
words "semantic layer". Retina says `Emails`, `Documents`, `Diffs`.

### 10.2 Ontology graph, from Ontology Manager and the Pilot ontology tab

The docs describe an interactive graph of **object type nodes**, **action type nodes** and **link
type edges**, with pan, zoom, select, an **automatic hierarchical layout**, and a **status legend**
distinguishing `Existing` from `Proposed` entities, filterable by status.

What Retina takes: all of it, in `ontology-patterns.md` section 5. Specifically the hierarchical
layout (which also settles the chat result graph's layout question: layered, never force directed)
and the built-against-planned status legend, which lets Retina draw the four entity types it has
designed but not yet built without lying about the schema.

What Retina leaves: action type nodes on the graph. Retina has five review actions and they belong
in the review inbox, not on a schema diagram.

### 10.3 Search around and histogram filters, from Vertex

The most useful single idea on this page. Vertex draws objects as nodes and relationships as
edges; clicking an object opens a **selection panel** with its properties; a **right-click menu**
offers selection, layout and exploration options; a **Search Around** traverses relationships with
a **filter icon next to each object count**; **histogram filters** show a property's values and
totals for the selected objects, and selections reflect back into the graph dynamically. Multi-hop
traversals are built with an **Add link** button, and searches can be saved and parameterised.

What Retina takes: `ontology-patterns.md` sections 2.6 and 2.7. Search around with a per link type
count, and facets that show the distribution they filter. Both are cheap to build and both make a
relational schema feel like a graph without drawing one.

What Retina leaves: the multi-hop traversal builder, saved searches and parameters. Retina has one
dataset, twenty entity types and a hackathon deadline. Two or three hand-picked derived traversals
per entity type deliver most of the value of a traversal builder at none of the cost.

### 10.4 Object Explorer

Described as a search and analysis tool over the Ontology: keyword search through to property
filters from a point-and-click interface, drilling into objects individually **and in aggregate**,
**comparing and contrasting object sets**, bulk actions and export.

What Retina takes: object sets as a first-class result. A search-around result in Retina carries a
header naming how it was reached, and can be saved as a view. And the compare-two-sets idea lands
on the evaluation screen as run against run.

What Retina leaves: bulk actions. In Retina, review decisions are per email and per field on
purpose, and a bulk approve would undo the product's entire argument.

### 10.5 Gaia and Map

The Map application's interface, quoted from the docs:

- Left panels: **Layers** ("add, manage, and style object and overlay layers; set the base layer"),
  **Find** (objects, locations, coordinates), **Histogram** (filter and analyse by property and
  time series values), **Info** (overall map summary).
- Right panels: **Selection** (details and actions for selected items), **Time Selection** (time
  range and current timestamp).
- Bottom right: **Series**, for temporal analysis of time series and event data.
- Top toolbar: **Select**, **Search Around**, **Draw**, **Capture**, **Measure**, **Annotate**,
  **Delete**.
- Rendering: Web Mercator (EPSG:3857), coordinates expected as WGS 84 (EPSG:4326).
- Gaia adds **Follow Along**, which tracks another user's cursor, zoom, pan and selection live.

What Retina takes: the panel arrangement almost verbatim (`ontology-patterns.md` section 4.7),
with Selection replaced by Retina's standard inspector so the map is not a special case. The Time
Selection plus Series pairing becomes Retina's run replay scrubber, which is the best idea on this
page for the demo. Web Mercator for flat mode, WGS 84 storage.

What Retina leaves: Draw, Annotate, Measure and Delete, because Retina has no use for them and an
unused tool in a toolbar is a lie about the product. Follow Along is a genuinely good feature and
explicitly out of scope: Retina has one shared password and no user identities.

### 10.6 Gotham's earth

The marketing material presents the earth as a common operating picture with live tracks and full
situational awareness from control centre to edge.

What Retina takes: the globe as the default projection for the geographic view, and moving marks
along lanes to carry direction and volume (`ontology-patterns.md` sections 4.2 and 4.5).

What Retina leaves: the entire palette and register. No black, no tactical red, no atmosphere
glow, no terminator, no idle rotation. Retina's earth is white paper with grey land, and the only
moving thing on it is cargo. It also makes no claim to be tracking anything: Retina has no AIS
feed, its arcs are great-circle schematics, and the legend says so.

### Palantir sources

- [Gotham platform page](https://www.palantir.com/platforms/gotham/)
- [Map interface overview](https://www.palantir.com/docs/foundry/map/map-overview)
- [Map overview](https://www.palantir.com/docs/foundry/map/overview)
- [Ontology overview](https://www.palantir.com/docs/foundry/ontology/overview)
- [Vertex, explore object relationships](https://www.palantir.com/docs/foundry/vertex/explore-object-relationships)
- [Object Explorer overview](https://www.palantir.com/docs/foundry/object-explorer/overview)
- [Pilot workspace, ontology tab](https://www.palantir.com/docs/foundry/pilot/ontology-tab)
- [Coordinate reference systems and projections](https://www.palantir.com/docs/foundry/geospatial/coordinate-reference-systems-and-projections)
- [Frontend engineering at Palantir: real-time map collaboration](https://blog.palantir.com/frontend-engineering-at-palantir-redefining-real-time-map-collaboration-8845ebb928d1)
  (the Gaia and Follow Along details above are from the search result summary of this post; a
  direct fetch returned HTTP 403, so it has not been read in full)

---

## 11. Deliberately not references

Named so nobody wastes time pulling them in later:

- **Linear.** Beautiful, and the wrong density. Linear is built for a list of forty issues; Retina
  is built for a table of five hundred and twenty emails with seven pipeline states each.
- **Vercel and Geist.** The right restraint, but no answer at all to provenance, graphs or
  geography, which is where this product's design problem actually lives.
- **Datadog and Grafana.** The right density and the wrong theme, and both are dashboard-first
  where Retina is record-first. Take the sparkline strip idea and leave the rest.
- **Any AI product with a purple gradient.** Section 11 of the design doc.
- **Nautical and maritime visual clichés.** Rope, portholes, compass roses, anchors, wheel motifs,
  navy-and-gold. The domain is serious and the audience works in it every day. Signalling "ships"
  at them is the design equivalent of explaining their own job back to them.
