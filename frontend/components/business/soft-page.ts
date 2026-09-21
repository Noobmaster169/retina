/**
 * How much of a list is on the page, and how much the next scroll adds.
 *
 * The lists arrive whole: a few hundred companies, every port, two hundred
 * shipments. Drawing all of them was costing twice. Once in the browser, which
 * lays out and paints several hundred cards nobody has scrolled to; and once in
 * what it does to prefetching, because every card is a link, and a few hundred
 * links in the document means the work of warming the one a person is about to
 * click competes with three hundred they will never open.
 *
 * So the page grows instead. It opens with enough to fill the screen and adds
 * a step each time the end comes into view, which keeps the scroll continuous:
 * nothing is paged, nothing is clicked, there is simply always more below.
 *
 * Pure: counts in, a count out. The hook that watches the scroll is beside it
 * in `use-soft-page.ts`.
 */

/** A step's worth more, never past the end. */
export function nextCount(current: number, step: number, total: number): number {
  if (step <= 0) return total;
  return Math.min(current + step, total);
}

/**
 * Enough to reach a row that has to be drawn whatever the scroll says.
 *
 * The inbox is the case: which email is open is settled on the server from the
 * address and a cookie, and it can be the hundredth. A list that opened at
 * twenty-four would have selected a row that was not there, and the pane
 * beside it would have shown an email the list did not appear to contain.
 */
export function coveringCount(count: number, at: number, step: number, total: number): number {
  if (at < 0) return count;
  return Math.min(Math.max(count, at + 1 + Math.floor(step / 2)), total);
}

/**
 * What a list shows when it opens, or after a filter changes.
 *
 * Never fewer than a step, and never a remainder so small that a person would
 * see a sentinel flash and resolve in the same frame: a list of 26 with a step
 * of 24 opens whole rather than showing 24 and making them scroll for two.
 */
export function openingCount(step: number, total: number): number {
  if (step <= 0) return total;
  return total <= step + Math.floor(step / 2) ? total : step;
}

/** A few rows of cards: enough to fill a wide screen and a scroll of the next. */
export const CARD_STEP = 24;

/** Rows are cheaper than cards, so a table opens with more of them. */
export const TABLE_STEP = 50;

/**
 * How many cards are fetched whole before anyone points at one.
 *
 * The first screenful of a list is where a person clicks without scrolling, and
 * these are the clicks that should land on a drawn page. It stops at six
 * because each one is a real render of that page behind the scenes, and the
 * rest of the list is covered for free by the card warming itself on hover.
 */
export const EAGER_CARDS = 6;
