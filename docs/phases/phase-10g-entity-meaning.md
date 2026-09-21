# Phase 10g: what a thing means, on the page

**Goal.** Every kind the ontology resolves opens into what it means in this trade, not into the
columns that hold it. The four kinds 10f resolved (carrier, vessel, commodity, person) become
navigable, and Shipment stops being dashed.

## Why this phase exists

10f taught the resolver, the profiler and the chat about six kinds. Two read paths never heard:
`GET /ontology/:type` and `/:type/:id/detail` refuse anything but a port or a party
(`ontology.routes.ts`), and the frontend keeps its own two-kind list in
`components/ontology/tab-body.tsx` and `app/runs/[id]/database/page.tsx`. So the rail counts
Carriers 5 and the body says "This type is designed and not built yet".

The second half is worse than a gate. What a port opens into today is `read_from: 10`,
`runs: 2`, `kind: port`: the plumbing that stores it, not the trade it sits in.

**The insight layer already exists.** `entities.dossier.ts` runs seven bounded queries per thing
(spellings with how each joined, roles with counts, counterparties, lanes, goods, addresses,
quotes, first and last mail date), assembles a `DossierInput`, renders it to markdown for the
profile prompt and throws the structure away. One dossier, two readers: the model and the
person. That is the whole of this phase's backend.

## What a shipment is here, and what it is not

The generator calls `make_shipment` once per email with fresh references
(`emails/data_v2/generate.py`), so no two emails in the inbox share an order or BL number. Checked
on the 25 backfilled rows: zero repeats.

A shipment is therefore **the consignment one email describes**, grouped with any other email
that shares an identifier (`oc_no`, `bl_no`, `booking_ref`, `invoice_no`, `po_no`). Exact equality
on an identifier, union-find over the five, nothing fuzzy: an identifier is for identifying, and
this is not a rule fitted to one sample. Every group holds one email today and the card says so.
The moment a fresh seed or a real mailbox threads two emails onto one booking, the grouping is
already right.

## Build

**Backend.**

- Split `loadDossierInput` out of `loadDossier` in `entities.dossier.ts`; `buildDossier` keeps
  rendering it for the prompt. Add the entity id to the counterparty and lane rows so a facet can
  link.
- `contracts.insight.ts`: `EntityInsight`, one facet list per kind, and `ShipmentView`.
- `entities.insight.ts`: the kind-specific reads the dossier does not carry (a carrier's vessels,
  a vessel's voyages, HS codes, container and weight totals, the disputed appearance count, the
  references a thing's shipments carry).
- `pipeline/ontology/insight.ts`: pure, decides which facets a kind shows and in what order.
  Table-driven test.
- Widen both route gates to the full `EntityKind`. `insight` rides on `EntityDetail`, so the page
  is still one round trip.
- Migration `023`: `core.shipments` (the group, its references, its resolved roles, its cargo and
  terms) and `core.shipment_emails` (membership). Expand only.
- `pipeline/ontology/shipment-group.ts`: pure union-find over the five identifiers, table-driven
  test. A regroup step in the ontology job, replacing only the groups the email touches.
- `shipments.repo.ts`, `GET /ontology/shipment` and `/ontology/shipment/:id`, descriptor gains its
  table so the rail stops drawing it dashed.

**Frontend.**

- Mirror the contracts; replace the two stale two-kind constants with the `isResolved` that
  already exists in `components/graph/glyphs.ts`.
- One insight component set, shared by all six kinds: identity strip, then at most three facets,
  then the evidence behind a disclosure. The plumbing links (`read_from`, `runs`, `documents`)
  move into that disclosure.
- Per-kind blurb on the database page.
- Shipment list and record.

## What each kind shows

One sentence from the profile, an identity strip, at most three facets, evidence behind a
disclosure. Training knowledge is shown and marked unverified, which is what the stored
`attributeSources` already says per attribute.

| Kind | Identity | Facets |
| --- | --- | --- |
| Port | country, region, subregion, locode, coast | which end of the lane it plays and how often; the ports it pairs with; what moves through it, and how many appearances the judge disputed |
| Party | kind, sector, group, country, city | what they are to us (shipper against consignee against notify); where they trade; what they handle, with the addresses seen and any disagreement between them |
| Carrier | full name, SCAC, kind | the vessels sailing under them; the lanes served and who books them; volume, with the bill and booking formats seen |
| Vessel | operator, the carrier it sailed for | voyages, each with its lane and date; cargo carried |
| Commodity | family, HS chapter, use | the HS codes seen in the mail; who sells it against who buys it; where it goes, with weight and container totals |
| Person | company, title, team, and no general section | how we know them (sender, signer, addressee) and what tied two sightings; who they work with; what their mail concerns |
| Email | its category and outcome | what the mail says about its shipment, each value with its quote; what was resolved out of it, by role; what the check found |
| Shipment | its references, and how many emails | the lane; the parties; the carriage; the cargo and terms; the fields the judge disputed |

## Exit checklist

- [x] All six resolved kinds list and open from the ontology page and the database page.
- [x] A port, a party, a carrier, a vessel, a commodity and a person each open into meaning: the
      profile's sentence, the identity strip and its facets, with no `read_from` or `runs` above
      the fold.
- [x] Shipments is no longer dashed; a shipment opens into its lane, parties, carriage, cargo and
      disputed fields, and says how many emails it was read from.
- [x] Every number on a facet traces to a bounded query, and a thing with 200,000 appearances
      costs the same to open as one with three.
- [x] `pnpm test`, `pnpm type-check` green in `backend/`; `pnpm test`, `pnpm lint`,
      `pnpm type-check` green in `frontend/`.
- [x] `docs/03-infra-deep.md` carries the new routes and contracts; `PROGRESS.md` updated.
