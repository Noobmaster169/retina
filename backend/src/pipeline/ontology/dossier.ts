import type { EntityKind } from "../../contracts";

/**
 * What the profile step is shown about one thing.
 *
 * Fixed size whatever the thing's traffic. A port named in two hundred
 * thousand emails and one named in three produce a dossier of the same shape
 * and nearly the same length, because a profile is a description and not a
 * transcript: the counts say how much there is, and the samples say what it
 * looks like.
 *
 * Pure. The caller loads each part with its own bounded query; this cuts,
 * orders and renders.
 */

/** Past these, more rows tell a reader nothing the counts do not. */
export const LIMITS = { names: 20, roles: 12, counterparties: 10, lanes: 10, goods: 10, addresses: 10, quotes: 20 } as const;

export interface DossierInput {
  kind: EntityKind;
  canonical: string;
  /** Every spelling, with how often it was seen and which judge joined it. */
  names: { value: string; seenCount: number; joinedBy: string }[];
  /** How often it played each role, and in how many emails. */
  roles: { role: string; appearances: number; emails: number }[];
  /** The things it most often appears beside, with how many emails they share. */
  counterparties: { name: string; kind: string; emails: number }[];
  /** Loading to discharge, for a thing that is a port or a party on a shipment. */
  lanes: { from: string; to: string; emails: number }[];
  goods: { description: string; emails: number }[];
  addresses: string[];
  /** The lines it was actually read from, newest first. */
  quotes: string[];
  emails: number;
  firstMailDate: string | null;
  lastMailDate: string | null;
}

export interface Dossier {
  kind: EntityKind;
  canonical: string;
  /** Every spelling, unrendered, for the search text a profile writes. */
  spellings: string[];
  /** One rendered section per part, in the order the prompt reads them. */
  sections: Record<string, string | string[]>;
}

function counted<T>(rows: T[], limit: number, render: (row: T) => string): string[] {
  const kept = rows.slice(0, limit).map(render);
  if (rows.length > limit) kept.push(`and ${rows.length - limit} more`);
  return kept;
}

/** A quote is a line off a document; a long one crowds out the rest of the dossier without saying more. */
const QUOTE_CHARS = 200;

export function buildDossier(input: DossierInput): Dossier {
  const seen = [input.firstMailDate, input.lastMailDate].filter((date) => date !== null);
  return {
    kind: input.kind,
    canonical: input.canonical,
    spellings: input.names.map((name) => name.value),
    sections: {
      "what it is called": counted(input.names, LIMITS.names, (name) => `${name.value} (seen ${name.seenCount}, joined ${name.joinedBy})`),
      "how it appears": counted(input.roles, LIMITS.roles, (role) => `${role.role}: ${role.appearances} times in ${role.emails} emails`),
      "seen with": counted(input.counterparties, LIMITS.counterparties, (other) => `${other.name} (${other.kind}) in ${other.emails} emails`),
      lanes: counted(input.lanes, LIMITS.lanes, (lane) => `${lane.from} to ${lane.to} (${lane.emails} emails)`),
      goods: counted(input.goods, LIMITS.goods, (item) => `${item.description} (${item.emails} emails)`),
      "addresses it has been written with": counted(input.addresses, LIMITS.addresses, (address) => address),
      "lines it was read from": counted(input.quotes, LIMITS.quotes, (quote) =>
        quote.length > QUOTE_CHARS ? `${quote.slice(0, QUOTE_CHARS)}...` : quote,
      ),
      "how much": `${input.emails} emails${seen.length > 0 ? `, mail dated ${seen.join(" to ")}` : ", no email states a date"}`,
    },
  };
}
