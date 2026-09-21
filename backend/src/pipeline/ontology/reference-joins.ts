import { locatePort } from "../../reference/ports";
import { kindOfField } from "./resolve";
import type { Mention, Sighting, Verdict } from "./resolved";

/**
 * Two spellings of a port the world's list places at one UN/LOCODE are one
 * port, and this says so in the shape the resolver already reads: a verdict.
 *
 * A port is unique by its code, not by how a document spelt it. The field
 * judge only ever compares the two documents of one email, so "MOMBASA_KENYA"
 * on one shipment and "MOMBASA, KENYA (KEMBA)" on another never met a judge
 * and stayed two things. The reference list is not a rule fitted to the inbox:
 * it is the world's ports, and placing a spelling by the words of its name is
 * what `locatePort` already does for the map. The code written in the text is
 * not trusted, because the dataset writes stale codes on documents that name a
 * different port; the placement is.
 *
 * Pure. Every join is emitted afresh on every pass, so nothing here needs
 * storing to survive a refresh.
 */

export function referenceJoins(mentions: Mention[], sightings: Sighting[]): Verdict[] {
  const spellings = new Set<string>();
  for (const mention of mentions) if (kindOfField(mention.field) === "port") spellings.add(mention.value);
  for (const sighting of sightings) if (sighting.kind === "port") spellings.add(sighting.value);

  const byCode = new Map<string, string[]>();
  for (const spelling of spellings) {
    const locode = locatePort(spelling)?.locode;
    if (!locode) continue;
    const held = byCode.get(locode);
    if (held) held.push(spelling);
    else byCode.set(locode, [spelling]);
  }

  const joins: Verdict[] = [];
  for (const group of byCode.values()) {
    const [first, ...rest] = group.sort();
    for (const other of rest) joins.push({ kind: "port", siValue: first, blValue: other, same: true, confidence: null, step: "reference" });
  }
  return joins;
}
