/**
 * Which of a thing's attributes go on the card a chat mention opens.
 *
 * Every kind stores different attributes, so the pages that list them each
 * name their own (a port shows its locode, a company what it does). A card
 * that opens on any kind by id has no page to take that from, so the order
 * lives here once: the two or three values that say which thing this is, most
 * identifying first, and never more than fits on one line.
 *
 * Pure: a kind and the stored attributes in, the chips out.
 */

const BY_KIND: Record<string, string[]> = {
  party: ["kind", "city", "country"],
  port: ["locode", "country", "subregion"],
  carrier: ["scac", "fullName", "kind"],
  vessel: ["operator"],
  commodity: ["family", "use"],
  person: ["title", "company"],
};

/** Past this the card wraps, and a card that wraps is a page. */
const MAX_CHIPS = 3;

export function previewChips(kind: string, attributes: Record<string, string | null>): string[] {
  return (BY_KIND[kind] ?? [])
    .map((key) => attributes[key])
    .filter((value): value is string => value !== null && value !== undefined && value !== "")
    .slice(0, MAX_CHIPS);
}
