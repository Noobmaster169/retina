import Link from "next/link";

import { LABEL_OF } from "@/components/graph/glyphs";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icons";
import type { GraphNode, ObjectLink, StoredValue } from "@/lib/api/ontology-schemas";
import { formatWhen } from "@/lib/when";

/**
 * The right rail of the Links tab: whichever node the reader is on.
 *
 * `Step to` is what makes a relational schema feel like a graph: it walks a
 * whole link type at once instead of one edge at a time. A link with nothing
 * at the other end still gets a row, greyed and unclickable, because knowing
 * there are no differences about a thing is worth a line.
 */

interface GraphInspectorProps {
  node: GraphNode;
  blurb: string;
  values: StoredValue[];
  links: ObjectLink[];
  /** Where the node's own page is, when it has one. */
  openHref: string | null;
  openLabel: string;
}

export function GraphInspector({ node, blurb, values, links, openHref, openLabel }: GraphInspectorProps) {
  return (
    <aside aria-label="The selected thing" className="flex min-w-0 grow flex-col border-l border-hairline">
      <div className="px-5 pt-4">
        <Chip tone={node.tone === "neutral" ? "neutral" : node.tone}>{LABEL_OF[node.type]}</Chip>
        <div className="mt-2 truncate font-mono text-[16px] font-medium">{node.label}</div>
        <p className="mt-2 text-strong leading-5 text-ink-secondary">{blurb}</p>
      </div>

      <div className="px-5 pt-3.5">
        <h3 className="flex h-7 items-center text-caption font-medium text-ink-tertiary">What it holds</h3>
        <ul>
          {values.slice(0, 6).map((value) => (
            <li key={value.key} className="flex h-[30px] items-center border-t border-hairline-faint">
              <span className="w-[116px] shrink-0 font-mono text-mono-sm text-ink-tertiary">{value.key}</span>
              <span
                className={`min-w-0 grow truncate text-small ${
                  value.value === null ? "text-ink-faint" : value.tone === "differ" ? "font-mono text-differ" : "text-ink-secondary"
                }`}
              >
                {value.value === null ? "not set" : value.valueType === "date" ? formatWhen(value.value) : value.value}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-5 pt-3.5">
        <h3 className="flex h-7 items-center text-caption font-medium text-ink-tertiary">
          Step to
          <span className="grow" />
          <span className="font-normal text-ink-faint">one click each</span>
        </h3>
        <ul>
          {links.map((link) => (
            <li key={link.key}>
              <span
                className={`flex h-[30px] items-center gap-2 border-t border-hairline-faint text-small ${
                  link.count === 0 ? "text-ink-faint" : "text-ink-secondary"
                }`}
              >
                <span className="min-w-0 grow truncate">{link.label}</span>
                <span className={`font-medium ${link.tone === "differ" && link.count > 0 ? "text-differ" : ""}`}>
                  {link.count}
                </span>
                <Icon name="chevron" size={11} className="shrink-0 text-ink-faint" />
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grow" />
      <div className="border-t border-hairline px-5 py-3.5">
        {openHref ? (
          <Link
            href={openHref}
            className="flex h-[34px] w-full items-center justify-center rounded-md bg-ink text-strong font-medium text-ink-inverse"
          >
            {openLabel}
          </Link>
        ) : (
          <p className="text-caption leading-[17px] text-ink-tertiary">
            This thing lives only in the model. Its record is the page you are on.
          </p>
        )}
      </div>
    </aside>
  );
}
