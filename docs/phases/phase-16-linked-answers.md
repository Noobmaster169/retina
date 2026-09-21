# Phase 16: a name in an answer opens

The chat resolves the things a question names and then says their names in flat prose. A reader
who wants to see the company it just counted has to go and find it again by hand. This phase makes
each of those names the thing it is: hovering says what it is, clicking opens its page.

## The rule this is built on

The agent already holds the id. `find_entity`, `find_entities`, `get_entity` and `list_entities`
all print one beside every name they return, so the link is written where the id is known and not
matched back onto the prose afterwards. Matching names in the finished text is the alternative and
it is the one this repository already refuses elsewhere: it is a string rule fitted to one inbox,
wrong on a partial spelling and wrong on a name two things share.

What the agent writes is checked before it is stored. `agents/chat/mentions.ts` keeps a link only
where a call on that turn reported the id, which is the test `grounding.ts` applies to a SQL
literal, for the same reason: an id written from memory leads somewhere else or nowhere, and
neither is visible in prose. A link that fails loses its markup and keeps its words.

## The work

- [x] `ToolOutcome.mentions`: the ids a call printed, filled by the four tools that resolve things.
- [x] `agents/chat/mentions.ts`, pure and table-tested: keep a link only where the turn was shown
      its id, rewrite it to `entity:<kind>/<id>`, strip the markup from one that fails.
- [x] Applied in `loop.result.assemble`, so the stored `content` carries the checked form and a
      reload draws the same links.
- [x] Chat prompt `v8`: link each resolved thing once, the first time it is named, with an id a
      tool printed. Repeated beside the `answer` field, where a constrained output follows it.
- [x] `GET /ontology/entity/:id/preview`: the `EntityRow` a list already draws, by id alone.
- [x] `components/chat/mention.ts`, pure and table-tested: the href to a mention, and the trailing
      half-written link the streaming preview holds back.
- [x] `EntityMention` and `MentionCard`: the kind's hue and a dotted rule inline, a Radix hover
      card that reads the preview once per thing hovered, and a link to the page for the kinds
      that have one.
- [x] `markdown.tsx` draws a verified mention as that component and anything else `entity:` as
      plain words, so a link appears only once it is known to lead somewhere.

## Exit checklist

- [x] `pnpm type-check` and `pnpm lint` clean on both packages.
- [x] `mentions` and `mention`/`preview-chips` table tests pass; the preview route answers and is
      not shadowed by `/:type/:id/:beside`.
- [x] `docs/03-infra-deep.md` section 11.1d and the ontology route table carry the contract.
- [ ] A live turn watched on the running stack: names linked, a card opening, a click landing on
      the right page. Spends real tokens, so it is the user's.

## Deferred

- **Emails and shipments are not linkable.** Both have pages, and neither has an id a chat tool
  prints in the same shape as a resolved thing's. Worth doing; it is a second id scheme, not a
  second line.
- **A hover card does not open on touch.** The link still navigates, so a touch reader loses the
  preview and keeps the destination. A tap-to-preview would need the mention to stop being a link.
