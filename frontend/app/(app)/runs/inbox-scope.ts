import type { Choice } from "./labelled-select";

/**
 * What a new run may be asked to read, from the size of the inbox actually
 * being served.
 *
 * The form used to say "The whole inbox, 520" and offer at most a hundred,
 * because for a long time there was only the organisers' set. The email server
 * takes its dataset as configuration (`INBOX_DATA`), so the inbox behind this
 * screen may be another one entirely, and a form naming a number it no longer
 * serves is a form nobody can trust about the rest.
 *
 * Pure: a count in, the choices out.
 */

/**
 * The 520 the organisers shipped. `dev` and `holdout` name ids from that set
 * and from no other, because the split under `eval/` was made from its answer
 * key; against a different inbox they would ask for emails that are not there.
 */
export const ORGANISERS = 520;

/** Steps a person actually thinks in: a look, a decent sample, a big one, everything. */
const STEPS = [5, 10, 20, 30, 50, 100, 200, 500, 1000, 2000];

/** A number a person reads, not one they count the digits of. */
export function grouped(n: number): string {
  return n.toLocaleString("en-GB");
}

/** The counts `The first N` offers: every step the inbox is big enough for. */
export function countsFor(inbox: number | null): Choice[] {
  const size = inbox ?? ORGANISERS;
  const steps = STEPS.filter((n) => n < size);
  return steps.map((n) => ({ value: String(n), label: `${grouped(n)} emails` }));
}

/**
 * The scopes, with the whole inbox named by what it actually holds.
 *
 * The two eval subsets are offered only against the set they were built from.
 * Hidden rather than disabled: a choice that cannot be chosen is a question
 * about why, and the answer is of no interest to anyone not running the eval.
 */
export function scopesFor(inbox: number | null, organisers = true): Choice[] {
  const size = inbox ?? ORGANISERS;
  return [
    ...(organisers
      ? [
          { value: "dev", label: "Dev sample, 30 emails" },
          { value: "holdout", label: "Holdout, 104 emails" },
        ]
      : []),
    { value: "all", label: inbox === null ? "The whole inbox" : `The whole inbox, ${grouped(size)}` },
    { value: "first", label: "The first N" },
  ];
}

/**
 * What running this many costs, in the words the confirm box uses.
 *
 * From the one full run there is a measurement for: 520 emails, 1,351 calls,
 * $24.02. It is a rate and not a promise, which is why it is said as "about":
 * an inbox with a different share of comparisons spends differently, and a
 * comparison is roughly six calls against a sorting's one.
 */
export function priceOf(emails: number): string {
  const calls = Math.round((emails * 1351) / 520);
  const dollars = (emails * 24.02) / 520;
  const minutes = Math.round((emails * 11) / 520);
  return `about ${grouped(calls)} model calls, roughly $${dollars.toFixed(0)}, and around ${grouped(minutes)} minutes`;
}
