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

- [x] `pnpm test`, `pnpm type-check` green in `backend/`; `pnpm test`, `pnpm type-check`, `pnpm lint` green in `frontend/`.
- [x] `/port` draws a located pin. Proven by locating one port (Singapore) through the live `sonnet-web` alias rather than a full backfill: every local port was already profiled and not stale, so the scheduled pass would not have touched them. Located by a web search in 13 s, source `search` at 0.9.
- [x] A question asked in the dock on `/company/[id]` with the company chip attached stores that ref on the turn and the answer is about that company.
- [x] Navigating between two pages while an answer is in flight keeps the answer.
- [x] `docs/03-infra-deep.md` lists every new route; `docs/05-design.md` carries the accent and kind tokens.
- [x] `PROGRESS.md` updated; merged to `main` locally. Not pushed: `main` auto-deploys to the box, and the push is the user's.
