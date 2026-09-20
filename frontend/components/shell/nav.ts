import type { IconName } from "@/components/ui/icons";

/**
 * The rail's destinations. The entity types sit beside the operations on
 * purpose: docs/05-design.md section 7 calls putting them in the navigation
 * the cheapest way to say this product has a knowledge model and not just a
 * list of emails.
 *
 * `planned` marks a destination phase 7 does not build. It renders, it is
 * reachable, and it says what it is waiting for rather than 404ing.
 */
export interface Destination {
  key: string;
  label: string;
  icon: IconName;
  href: string;
  planned?: string;
}

export const DESTINATIONS: Destination[] = [
  { key: "runs", label: "Runs", icon: "home", href: "/runs" },
  { key: "inbox", label: "Inbox", icon: "mail", href: "/inbox", planned: "phase 8" },
  { key: "review", label: "Needs a person", icon: "doc", href: "/review", planned: "phase 8" },
  { key: "database", label: "Database", icon: "table", href: "/database", planned: "phase 10" },
  { key: "ontology", label: "Ontology", icon: "graph", href: "/ontology", planned: "phase 10" },
  { key: "chat", label: "Ask Retina", icon: "chat", href: "/chat", planned: "phase 10" },
];

/** Counts the rail shows against its destinations. Absent keys render no count. */
export type NavCounts = Partial<Record<string, number>>;
