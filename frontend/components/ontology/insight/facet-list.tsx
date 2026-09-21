import Link from "next/link";

import type { InsightFacet, InsightLine } from "@/lib/api/insight-schemas";

/**
 * One heading, the sentence that says what it means, and its measured lines.
 *
 * The count sits right and the label left, so a facet reads as a list of
 * things rather than as a table of numbers. Nothing here is coloured except a
 * line the judge disputed: on a page whose job is to say what a thing is, a
 * hue has to mean something is wrong with it.
 */

export function FacetList({ facet, hrefFor }: { facet: InsightFacet; hrefFor: (line: InsightLine) => string | null }) {
  return (
    <section className="border-t border-hairline-faint pt-3 pb-1">
      <h3 className="text-caption font-medium text-ink-secondary">{facet.heading}</h3>
      {facet.note ? <p className="mt-0.5 max-w-[60ch] text-small leading-[18px] text-ink-tertiary">{facet.note}</p> : null}
      <ul className="mt-1.5">
        {facet.lines.map((line, at) => (
          <li key={`${line.label}-${at}`} className="flex items-baseline gap-2 py-[3px]">
            <Label line={line} href={hrefFor(line)} />
            {line.detail ? <span className="min-w-0 shrink text-caption text-ink-tertiary">{line.detail}</span> : null}
            <span className="grow border-b border-dotted border-hairline" aria-hidden="true" />
            {line.count === null ? null : (
              <span className="shrink-0 text-caption tabular-nums text-ink-secondary">
                {line.count}
                {line.unit ? ` ${line.unit}${line.count === 1 ? "" : "s"}` : ""}
              </span>
            )}
          </li>
        ))}
      </ul>
      {facet.total > facet.lines.length ? (
        <p className="pt-1 text-caption text-ink-faint">and {facet.total - facet.lines.length} more</p>
      ) : null}
    </section>
  );
}

function Label({ line, href }: { line: InsightLine; href: string | null }) {
  const ink = line.tone === "differ" ? "text-differ" : "text-ink";
  const body = <span className={`text-small ${ink}`}>{line.label}</span>;
  if (href === null) return body;
  return (
    <Link href={href} className="min-w-0 truncate hover:underline hover:underline-offset-2">
      {body}
    </Link>
  );
}
