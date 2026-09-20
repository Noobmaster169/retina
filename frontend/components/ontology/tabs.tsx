import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/icons";

/**
 * Things, Record, Links: the list of a type, one of them, and its graph.
 *
 * Which tab is open is in the URL, so a link to a record is a link to that
 * record. They are real links and not buttons for the same reason: back works,
 * and the page can be opened in a tab.
 *
 * A tab with nothing behind it is not drawn. Only an email has a graph today,
 * and a dead `Links` on a port would be a promise the page does not keep.
 */

export type OntologyTab = "things" | "record" | "links";

interface TabsProps {
  active: OntologyTab;
  /** `null` for a tab this type or this selection cannot offer. */
  hrefs: Record<OntologyTab, string | null>;
}

const TABS: { key: OntologyTab; label: string; icon: IconName }[] = [
  { key: "things", label: "Things", icon: "table" },
  { key: "record", label: "Record", icon: "doc" },
  { key: "links", label: "Links", icon: "graph" },
];

export function OntologyTabs({ active, hrefs }: TabsProps) {
  const shown = TABS.filter((tab) => hrefs[tab.key] !== null);
  return (
    <div className="flex h-11 shrink-0 items-stretch gap-6 border-b border-hairline px-6">
      {shown.map((tab) => {
        const here = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={hrefs[tab.key] as string}
            aria-current={here ? "page" : undefined}
            className={`flex items-center gap-2 text-heading ${
              here ? "font-medium text-ink shadow-[inset_0_-2px_0_0_var(--ink)]" : "text-ink-secondary hover:text-ink"
            }`}
          >
            <Icon name={tab.icon} size={14} className={here ? "text-ink" : "text-ink-faint"} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
      <span className="grow" />
      <span className="self-center text-small text-ink-faint">One model, three ways to read it</span>
    </div>
  );
}
