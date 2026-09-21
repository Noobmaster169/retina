# Retina theme explorations

Generated from the current email-detail screen as high-fidelity visual directions. These are theme studies, not proposed information-architecture changes: the four-column workflow, dense inbox, source evidence, and Ask Retina context remain intact.

## Product premise

Retina is an AI-assisted shipping-document operations console. It reads a shared mailbox, classifies incoming messages, opens Shipping Instructions (SI) and draft Bills of Lading (BL), compares seven shipment fields, surfaces exact discrepancies, and escalates uncertain cases with their evidence. Each verdict remains traceable to the source line, model decision, and any human action.

Primary users are shipping documentation operators who need to clear many messages quickly without missing a costly BL discrepancy. Team leads and analysts use aggregate and conversational views; engineers need observable pipeline traces; hackathon judges need a legible live demonstration.

## Shared UX rules

- Color is semantic vocabulary, not decoration.
- `MISMATCH`, `NEEDS_REVIEW`, agreement, and system faults use separate hues and retain explicit labels or icons.
- The selected inbox row and current navigation location must be obvious without resembling a verdict.
- The central email and evidence remain the visual priority.
- Dense lists stay compact; panel separation comes from controlled surface shifts and 1 px rules.
- Text and controls should meet WCAG-conscious contrast targets, with visible keyboard focus.

## Directions

### 1. Harbor Signal

Recommended default. A deep navy navigation shell gives the product an operational anchor, while cobalt selection states remain separate from semantic verdict colors.

- Canvas: `#F7F9FC`
- Navigation: `#11243E`
- Interaction: `#2563EB`
- Agreement: `#14866D`
- Mismatch: `#D97706`
- Needs review: `#7C3AED`
- Fault: `#C2413A`

### 2. Cargo Ledger

A warmer and more distinctive enterprise direction. Ivory paper surfaces support extended reading, while forest and sea-green connect naturally to logistics without decorative maritime styling.

- Canvas: `#F7F4ED`
- Reading surface: `#FFFDF8`
- Navigation: `#173F35`
- Interaction: `#2F7668`
- Agreement: `#3E7C59`
- Mismatch: `#C65F20`
- Needs review: `#7B4A8F`
- Fault: `#B8483E`

### 3. Coastal Clarity

The lightest and calmest option. Subtle temperature shifts separate navigation, triage, reading, and assistant regions without adding visual weight.

- Canvas: `#F3F8FA`
- Text: `#183447`
- Interaction: `#087A78`
- Agreement: `#198754`
- Mismatch: `#D65A31`
- Needs review: `#6252B7`
- Fault: `#B9383E`

### 4. Night Watch

An exploratory low-glare theme for evening operations. This departs from the current light-only design specification, so it should be validated with real operators before implementation.

- Shell: `#0B1420`
- Panels: `#111D2A` / `#172433`
- Interaction: `#55A7FF`
- Agreement: `#49C79B`
- Mismatch: `#F3A447`
- Needs review: `#B69CFF`
- Fault: `#F2777A`

## Recommendation

Prototype **Harbor Signal** first. It makes location and selection substantially clearer, keeps semantic colors disciplined, and fits the existing serious enterprise posture. Use **Cargo Ledger** as the alternate if Retina needs a more ownable visual identity. Test both with operators using three timed tasks: locate a mismatch, distinguish mismatch from uncertainty, and trace a verdict back to evidence.
