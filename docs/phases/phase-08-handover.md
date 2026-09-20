# Phase 8 handover: the case pane is already built

Written 2026-09-20 by the design session, at the same time as `phase-07-handover.md`.

**Read `docs/phases/phase-07-handover.md` first, all of it.** It carries the canvas, the design
decisions behind it, and the contract gaps, and its last section is about this phase. What follows
is only the part that would be easy to miss.

1. **Do not build a second review component set.** The case pane is phase 7's email page in its
   NEEDS_REVIEW state, drawn on the `EmailReview.dc.html` board. Phase 8 filters the list to open
   cases, adds the action bar, and adds the routes behind it. The exit checklist asks for a diff
   showing no duplicate component.

2. **Every action writes a labelled example row**, and phase 11's drafting job reads those rows to
   propose lessons. The mapping is fixed: `correct_field` teaches `extract`, `reclassify` teaches
   `classify`, and a `note` teaches whichever step the case reason maps to. Getting the action
   kinds and their fields right here is most of phase 11.

3. **The chat's proposed action card is not yours to wire.** It describes this phase's write path,
   but nothing routes a chat turn into a `review_action` and no contract for it exists. Ship every
   action from the action bar; raise the contract with the user before phase 10 builds it.

4. **The product never arbitrates.** A correction records what a person says a value is. It never
   marks one document right. There is no correct value field anywhere in the UI and no button that
   writes to one side. `docs/05-design.md` section 2.2 and section 11.
