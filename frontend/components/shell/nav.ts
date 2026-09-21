import type { IconName } from "@/components/ui/icons";

/**
 * The rail's destinations, in two clusters. Operations is the work: mostly
 * scoped to a run, because a run is the context the pipeline's screens read
 * through, since the same inbox, the same cases and the same records look
 * different depending on which run produced them. Business data is what the
 * work resolved: a company, a port and a shipment are things the mail states,
 * and which replay read them changes nothing about them.
 *
 * The clusters say what a screen is about and not how it is addressed, so a
 * global destination may sit in either. `Traffic` is the one that does: the
 * gate admits mail before any run exists to scope it to, and it is still the
 * pipeline's own screen rather than a thing the mail resolved.
 *
 * docs/05-design.md section 7 calls putting the entity types in the navigation
 * the cheapest way to say this product has a knowledge model and not just a
 * list of emails.
 *
 * The active destination is derived from the pathname here rather than
 * declared by each page, because the shell mounts once in the layout and the
 * page is below it.
 *
 * `hidden` keeps a destination built and reachable by its URL while taking it
 * out of the rail. Database remains available to direct links, while the
 * Senders table moved onto the run overview; both pages still answer on their
 * own URLs without being offered as primary destinations.
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
  /**
   * Fetch this one whole before it is clicked, rather than only as far as its
   * loading shell.
   *
   * Every destination, because between the reuse in `lib/api/cached.ts` and
   * the lists no longer drawing themselves whole, a warmed page is no longer
   * an expensive thing to hold: the business reads behind one are a cache hit
   * for a minute after anybody opens it, and a list that renders its first
   * twenty-four rows is a fraction of the render it used to be.
   *
   * Next only prefetches in production, so this changes nothing in `pnpm dev`.
   */
  preload?: true;
}

export const DESTINATIONS: Destination[] = [
  { key: "overview", label: "Overview", icon: "home", path: "", cluster: "operations", preload: true },
  { key: "inbox", label: "Inbox", icon: "mail", path: "/inbox", cluster: "operations", preload: true },
  // Beside the inbox, because that is where it acts: what the gate holds never
  // reaches the mail below it. It still answers the second question a person
  // asks about a sender, the first being its tier on `Senders`, which is why
  // the two read as a pair from either side.
  { key: "gate", label: "Traffic", icon: "scale", path: "/gate", cluster: "operations", global: true, preload: true },
  { key: "database", label: "Database", icon: "table", path: "/database", cluster: "operations", preload: true, hidden: true },
  { key: "ontology", label: "Ontology", icon: "graph", path: "/ontology", cluster: "operations", preload: true },
  { key: "chat", label: "Ask Retina", icon: "chat", path: "/chat", cluster: "operations", preload: true },
  { key: "company", label: "Companies", icon: "party", path: "/company", cluster: "business", global: true, preload: true },
  { key: "port", label: "Ports", icon: "port", path: "/port", cluster: "business", global: true, preload: true },
  { key: "shipment", label: "Shipments", icon: "ship", path: "/shipment", cluster: "business", global: true, preload: true },
  // Hidden, not deleted: the page is still the whole table and still opens by
  // its URL. It left the rail when `Who is served first` moved onto the run
  // overview, because a sender's tier is a dial on the pipeline and not a
  // thing the mail resolved, and two doors to one table is how the two drift.
  { key: "clients", label: "Senders", icon: "client", path: "/clients", cluster: "business", global: true, hidden: true },
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
