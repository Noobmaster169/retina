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
 */
export interface Destination {
  key: string;
  label: string;
  icon: IconName;
  /** Appended to `/runs/{id}`, or taken whole when `global`. Empty for the run's own overview. */
  path: string;
  planned?: string;
  global?: true;
}

export const DESTINATIONS: Destination[] = [
  { key: "overview", label: "Overview", icon: "home", path: "" },
  { key: "inbox", label: "Inbox", icon: "mail", path: "/inbox" },
  { key: "review", label: "Needs a person", icon: "eye", path: "/review" },
  { key: "database", label: "Database", icon: "table", path: "/database", planned: "phase 10" },
  { key: "ontology", label: "Ontology", icon: "graph", path: "/ontology", planned: "phase 10" },
  { key: "chat", label: "Ask Retina", icon: "chat", path: "/chat", planned: "phase 10" },
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

/** Counts the rail shows against its destinations. Absent keys render no count. */
export type NavCounts = Partial<Record<string, number>>;
