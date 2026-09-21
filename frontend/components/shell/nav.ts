import type { IconName } from "@/components/ui/icons";

/**
 * The rail's destinations. Every one of them is scoped to a run, because a run
 * is the context the whole product reads through: the same inbox, the same
 * cases and the same records look different depending on which run produced
 * them, and a destination that ignored that would be showing a mixture.
 *
 * The entity types sit beside the operations on purpose: docs/05-design.md
 * section 7 calls putting them in the navigation the cheapest way to say this
 * product has a knowledge model and not just a list of emails.
 *
 * `planned` marks a destination this phase does not build. It renders, it is
 * reachable, and it says what it is waiting for rather than 404ing.
 *
 * `global` marks the one kind of destination that is not about a run. A
 * client's tier is a standing decision about a sender, not a property of one
 * replay, and scoping it to a run would say it was.
 *
 * `hidden` keeps a destination built and reachable by its URL while taking it
 * out of the rail. The database page is the only one: browsing raw tables
 * turned out to be a flow nobody needs next to the ontology, which answers the
 * same questions in the model's own words. It is hidden rather than deleted
 * because `As rows` is the page that proves the ontology is not a mock-up, and
 * a demo may still want to open it.
 *
 * `Needs a person` was a destination of its own until it stopped earning one.
 * It listed the same emails the inbox lists, from a second component set, with
 * a second idea of what was selected, and moving between the two lost your
 * place both ways. It is a chip on the inbox now, and `/runs/{id}/review`
 * redirects to it. What it keeps is its count, which reaches the rail as an
 * alert beside `Inbox`.
 */
export interface Destination {
  key: string;
  label: string;
  icon: IconName;
  /** Appended to `/runs/{id}`, or taken whole when `global`. Empty for the run's own overview. */
  path: string;
  planned?: string;
  global?: true;
  /** Built and reachable by URL, kept out of the rail. See above. */
  hidden?: true;
}

export const DESTINATIONS: Destination[] = [
  { key: "overview", label: "Overview", icon: "home", path: "" },
  { key: "inbox", label: "Inbox", icon: "mail", path: "/inbox" },
  { key: "database", label: "Database", icon: "table", path: "/database" },
  { key: "ontology", label: "Ontology", icon: "graph", path: "/ontology" },
  { key: "chat", label: "Ask Retina", icon: "chat", path: "/chat" },
  { key: "clients", label: "Clients", icon: "client", path: "/clients", global: true },
];

/**
 * Where a destination points. Without a run there is nothing to scope to, so
 * every run-scoped one leads to the run list, which is where a run is chosen
 * or made. The rail keeps its shape either way.
 *
 * A global destination is reachable whether or not a run exists, because what
 * it shows does not belong to one.
 */
export function hrefFor(destination: Destination, runId: string | null): string {
  if (destination.global) return destination.path;
  return runId ? `/runs/${runId}${destination.path}` : "/runs";
}

/** What the rail draws. A hidden destination still exists; it is simply not offered. */
export const RAIL_DESTINATIONS = DESTINATIONS.filter((destination) => !destination.hidden);

/** Counts the rail shows against its destinations. Absent keys render no count. */
export type NavCounts = Partial<Record<string, number>>;

/**
 * Counts the rail tints. An alert is not a bigger count, it is a different
 * question: `Inbox 104` says how much there is and `3` beside it says how much
 * of it is waiting on you. Zero draws nothing, so a quiet run stays quiet.
 */
export type NavAlerts = Partial<Record<string, number>>;
