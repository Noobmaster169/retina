import type { GateBucket, GateHeldRow, GateMode, GatePolicy, GateSenderRow, GateStanding } from "@/lib/api/gate-schemas";
import { formatWhen } from "@/lib/when";

/**
 * What the gate's numbers are called on screen.
 *
 * Wording, not contract: the api knows six standings and six reasons and
 * nothing about these sentences, so they live with the page rather than in the
 * file whose job is mirroring the backend.
 *
 * Every sentence here has to be one the row can actually justify. A person
 * deciding whether to whitelist a sender is owed the arithmetic, not a score.
 */

export const STANDING_LABEL: Record<GateStanding, string> = {
  blocked: "Blocked",
  trusted: "Allowed",
  established: "Established",
  regular: "Regular",
  new: "New",
  unknown: "Stranger",
};

/** Why this sender has the standing it has, from the two numbers that decided it. */
export function standingReason(row: GateSenderRow): string {
  if (row.standing === "blocked") return "Somebody blocked this sender";
  if (row.standing === "trusted") return "Somebody allowed this sender";
  if (row.daysSeen === 0) return "Nothing has ever arrived from it";
  const days = row.daysSeen === 1 ? "one day" : `${row.daysSeen} days`;
  return `Seen on ${days}${row.firstSeen ? `, first on ${formatWhen(row.firstSeen, false)}` : ""}`;
}

/** The three positions of the control, in the order it offers them. */
export const POLICIES: { policy: GatePolicy; label: string }[] = [
  { policy: "auto", label: "Judged on its record" },
  { policy: "allow", label: "Always let through" },
  { policy: "block", label: "Always hold" },
];

export const MODE_LINE: Record<GateMode, string> = {
  off: "The gate is off. Nothing is being metered and nothing is being held.",
  observe:
    "Watching only. Every email is priced and every bucket is charged, and nothing is held except senders somebody blocked by hand. This is what the gate would have done.",
  enforce: "Holding. An email that does not fit its sender's allowance waits here for a person.",
};

/** One sentence a held row can stand behind, built from what it was actually decided on. */
export function heldBecause(row: GateHeldRow): string {
  const bucket = row.buckets.find((one) => one.scope === row.scope);
  const whose = row.scope === "global" ? "everyone together" : row.principal;

  if (row.reason === "blocked_by_person") return `Somebody blocked ${whose}`;
  if (row.reason === "meter_unavailable") return "The meter could not be read, and this sender had no record to fall back on";
  if (row.reason === "budget") return "The day's budget is spent, and this sender has not earned a place in what is left";
  if (row.reason === "daily" && bucket) return `${whose} is past its day: ${bucket.dailyUsed + row.units} of ${bucket.dailyCap} units`;
  if (row.reason === "burst" && bucket) return `${whose} sent too much at once: ${row.units} units against ${Math.floor(bucket.burstRemaining)} left`;
  return "Admitted";
}

/** What the units were made of, in words, so nobody has to trust the total. */
export function costLine(row: GateHeldRow): string {
  const { email, attachments, comparison, oversize } = row.breakdown;
  const parts = [`${email} for the email`];
  if (attachments > 0) parts.push(`${attachments} for its documents`);
  if (comparison > 0) parts.push(`${comparison} for the comparison`);
  if (oversize > 0) parts.push(`${oversize} for its size`);
  return `${row.units} units: ${parts.join(", ")}`;
}

/** How full a bucket is, as a fraction, clamped so a cap of zero draws as full rather than as NaN. */
export function pressure(used: number, cap: number): number {
  if (cap <= 0) return 1;
  return Math.min(1, Math.max(0, used / cap));
}

/** The global bucket named the way the header talks about it. */
export function globalLine(bucket: GateBucket | null): string {
  if (!bucket) return "The meter could not be read.";
  return `${bucket.dailyUsed} of ${bucket.dailyCap} units across every sender today`;
}
