import type { IconName } from "@/components/ui/icons";

/**
 * The rail's destinations, in two clusters. Operations are scoped to a run,
 * because a run is the context the pipeline's screens read through: the same
 * inbox, the same cases and the same records look different depending on
 * which run produced them. Business data is global: a company, a port and a
 * shipment are things the mail resolved, and which replay read them changes
 * nothing about them. docs/05-design.md section 7 calls putting the entity
 * types in the navigation the cheapest way to say this product has a
 * knowledge model and not just a list of emails.
 *
 * The active destination is derived from the pathname here rather than
 * declared by each page, because the shell mounts once in the layout and the
 * page is below it.
 *
 * `hidden` keeps a destination built and reachable by its URL while taking it
 * out of the rail. None is hidden today: the database page is offered again,
 * because `As rows` is the page that proves the ontology is not a mock-up.
 *
 * `Needs a person` was a destination of its own until it stopped earning one.
 * It listed the same emails the inbox lists, from a second component set, with
 * a second idea of what was selected, and moving between the two lost your
 * place both ways. It is a chip on the inbox now, and `/runs/{id}/review`
 * redirects to it. What it keeps is its count, which reaches the rail as an
 * alert beside `Inbox`.
 */
export type Cluster = "operations" | "business";

export const CLUSTERS: { key: Cluster; label: string }[] = [
  { key: "operations", label: "Operations" },
  { key: "business", label: "Business data" },
];

export interface Destination {
  key: string;
  label: string;
  icon: IconName;
  /** Appended to `/runs/{id}`, or taken whole when `global`. Empty for the run's own overview. */
  path: string;
  cluster: Cluster;
  planned?: string;
  global?: true;
  /** Built and reachable by URL, kept out of the rail. */
  hidden?: true;
}

export const DESTINATIONS: Destination[] = [
  { key: "overview", label: "Overview", icon: "home", path: "", cluster: "operations" },
  { key: "inbox", label: "Inbox", icon: "mail", path: "/inbox", cluster: "operations" },
  { key: "database", label: "Database", icon: "table", path: "/database", cluster: "operations", hidden: true },
  { key: "ontology", label: "Ontology", icon: "graph", path: "/ontology", cluster: "operations" },
  { key: "chat", label: "Ask Retina", icon: "chat", path: "/chat", cluster: "operations" },
  { key: "company", label: "Companies", icon: "party", path: "/company", cluster: "business", global: true },
  { key: "port", label: "Ports", icon: "port", path: "/port", cluster: "business", global: true },
  { key: "shipment", label: "Shipments", icon: "ship", path: "/shipment", cluster: "business", global: true },
  { key: "clients", label: "Senders", icon: "client", path: "/clients", cluster: "business", global: true },
  // The second thing a person decides about a sender, beside its tier. Senders
  // is which one is served first; this is whether we spend anything on it at
  // all, and putting a blocklist on a page whose copy promises a tier decides
  // nothing else would make both harder to trust.
  { key: "gate", label: "Traffic", icon: "scale", path: "/gate", cluster: "business", global: true },
];

/**
 * Where a destination points. Without a run there is nothing to scope to, so
 * every run-scoped one leads to the run list, which is where a run is chosen
 * or made. A global destination is reachable whether or not a run exists.
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

const RUN_ROUTE = /^\/runs\/([0-9a-f-]{36})(?:\/([^/]+))?/;

export function runIdFrom(pathname: string): string | null {
  return RUN_ROUTE.exec(pathname)?.[1] ?? null;
}

/** Which destination a path is under. The empty string is the run list and anything unknown. */
export function activeFor(pathname: string): string {
  const run = RUN_ROUTE.exec(pathname);
  if (run) {
    const section = run[2] ?? "";
    if (section === "") return "overview";
    // Both redirect into the inbox, so the rail names the inbox while they do.
    if (section === "emails" || section === "review") return "inbox";
    return DESTINATIONS.some((destination) => destination.path === `/${section}`) ? section : "";
  }
  const head = `/${pathname.split("/")[1] ?? ""}`;
  return DESTINATIONS.find((destination) => destination.global && destination.path === head)?.key ?? "";
}
