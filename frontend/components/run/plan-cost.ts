/**
 * What a run actually cost, as opposed to what the same tokens would have cost
 * on the API.
 *
 * Nothing here is billed. The pipeline runs against a Claude Max subscription
 * through `proxy/`, which is a flat monthly fee, so a run's cost is its share
 * of that month rather than a charge. The API price the run already reports is
 * the counterfactual, and it is the larger and more familiar number, which is
 * why the panel shows it struck through rather than not at all.
 *
 * The share comes from one measured run and is scaled by tokens from there.
 * On the 520-email overnight run, Claude Code's own usage display put the work
 * at about 15% of a session and that session at about 15% of the week's
 * allowance, so:
 *
 *   0.15 of a session x 0.15 of a week x ($200 a month / 4 weeks) = $1.125
 *
 * Those two percentages are observations of one run, not a rate card, so they
 * are not applied to every run as though they were: a run of ten emails did
 * not take 15% of a session. What carries across is the price per token that
 * the measurement implies, and every other run is priced at it.
 *
 * Pure: tokens, an API price and an email count in, a set of numbers and the
 * working out.
 */

/** Claude Max 20x, the plan `proxy/` is logged into. */
const MONTH_USD = 200;
const WEEKS_IN_MONTH = 4;
/** What the reference run took of one session, and that session of one week. */
const SESSION_SHARE = 0.15;
const WEEK_SHARE = 0.15;
/** The reference run: 520 emails, 3,736 in and 1,482,174 out. */
const REFERENCE_TOKENS = 3_736 + 1_482_174;

/** The subscription share the reference run worked out to, in dollars. */
export const REFERENCE_USD = SESSION_SHARE * WEEK_SHARE * (MONTH_USD / WEEKS_IN_MONTH);

/** Approximate, and not fetched from anywhere: the panel says `about`. */
const MYR_PER_USD = 4;

export interface PlanCost {
  /** What these tokens would have cost on the API. The run's own figure, passed through. */
  apiUsd: number;
  /** This run's share of the subscription it really ran on. */
  planUsd: number;
  planMyr: number;
  /** In cents, because a fraction of a cent is the whole point. */
  perEmailCents: number;
  /** How many times cheaper than the API price. Null where there is nothing to compare. */
  timesCheaper: number | null;
  /** The working, so a number this surprising can be checked rather than believed. */
  working: string[];
}

export function planCost(tokens: number, apiUsd: number, emails: number): PlanCost {
  const planUsd = REFERENCE_TOKENS > 0 ? (Math.max(tokens, 0) / REFERENCE_TOKENS) * REFERENCE_USD : 0;
  return {
    apiUsd,
    planUsd,
    planMyr: planUsd * MYR_PER_USD,
    perEmailCents: emails > 0 ? (planUsd / emails) * 100 : 0,
    timesCheaper: planUsd > 0 && apiUsd > 0 ? apiUsd / planUsd : null,
    working: [
      `${(SESSION_SHARE * 100).toFixed(0)}% of a session`,
      `${(WEEK_SHARE * 100).toFixed(0)}% of a week`,
      `$${MONTH_USD} a month over ${WEEKS_IN_MONTH} weeks`,
    ],
  };
}

/** `$1.13`, or `$0.004` where rounding to a cent would read as free. */
export function money(usd: number): string {
  if (usd >= 0.01 || usd === 0) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(3)}`;
}

/** `0.2c`, at the one decimal that keeps a fraction of a cent legible. */
export function cents(value: number): string {
  return `${value < 1 ? value.toFixed(2) : value.toFixed(1)}c`;
}
