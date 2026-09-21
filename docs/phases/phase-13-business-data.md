# Phase 13: Business data pages and the chat dock

## Goal

The things the ontology resolves get pages a business owner opens: companies, ports on a map,
and shipments, each as cards or a table. The chat moves into a dock that survives navigation
and can carry what the open page is about as context.

Design: `docs/superpowers/specs/2026-09-21-business-data-and-chat-dock-design.md` (local, not
tracked). Plan: `docs/superpowers/plans/2026-09-21-business-data-and-chat-dock.md` (local).

## Prerequisites

Phase 10f merged. Phases 11 and 12 keep their names and numbers; this phase was asked for after
them and is built before them.

## Scope

In: port coordinates by a `port-locate` step; shipments API; entity lists carrying attributes,
summary and roles for six kinds; counterpart readers; per-message chat context; the shell in a
layout; the chat dock; `/company`, `/port`, `/shipment` with card, table and map views; accent
and kind hues. Out: editing records, folding Senders into companies, a tile map, attaching a
context the page does not offer.

## Work items

1. Port coordinates: contract, `port-locate` step on `sonnet-web`, locate after profile.
2. Shipments: contract, readers, routes.
3. Entity lists for six kinds with attributes, summary and roles; counterpart readers and routes.
4. Chat context: contract, migration 023, storage, resolution, scope text.
5. Frontend contract mirrors and passthrough routes.
6. Colour tokens: accent and kind hues; design doc.
7. Shell into a route-group layout with clusters.
8. Chat dock with the context strip; email rail removed.
9. Shared business components and the world map.
10. `/company`, `/port`, `/shipment` lists and details.
11. Ontology open links point at the business routes; docs.

## Exit checklist

- [ ] `pnpm test`, `pnpm type-check` green in `backend/`; `pnpm test`, `pnpm type-check`, `pnpm lint` green in `frontend/`.
- [ ] After `pnpm ontology:backfill --limit 30` and two profile ticks, `/port` draws at least one located pin.
- [ ] A question asked in the dock on `/company/[id]` with the company chip attached stores that ref on the turn and the answer is about that company.
- [ ] Navigating between two pages while an answer is in flight keeps the answer.
- [ ] `docs/03-infra-deep.md` lists every new route; `docs/05-design.md` carries the accent and kind tokens.
- [ ] `PROGRESS.md` updated; merged to `main`.
