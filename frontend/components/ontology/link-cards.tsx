import Link from "next/link";

import { GLYPH_OF } from "@/components/graph/glyphs";
import { Icon } from "@/components/ui/icons";
import type { ObjectLink } from "@/lib/api/ontology-schemas";

/**
 * The links out of a record, as cards.
 *
 * The last two of most sets are derived rather than stored: `Same client,
 * differed` is email to client to emails to comparisons, and it is the row
 * that makes this a knowledge tool rather than a schema browser. They are
 * drawn quieter and say so, because a reader should be able to tell a foreign
 * key from a traversal somebody chose.
 *
 * A link that names one thing rather than counting many carries a target, and
 * that card is the only one you can click. An email's shipment is the first of
 * them.
 */

const TONE: Record<NonNullable<ObjectLink["tone"]>, { border: string; bg: string; ink: string; glyph: string }> = {
  differ: { border: "border-differ-line", bg: "bg-differ-tint/30", ink: "text-differ", glyph: "text-differ" },
  review: { border: "border-review-line", bg: "bg-review-tint/40", ink: "text-review", glyph: "text-review" },
  match: { border: "border-hairline", bg: "", ink: "text-match", glyph: "text-match" },
};

export function LinkCards({ links, hrefFor }: { links: ObjectLink[]; hrefFor?: (link: ObjectLink) => string | null }) {
  const derived = links.filter((link) => link.derived).length;
  return (
    <section>
      <header className="flex h-[30px] items-center">
        <h2 className="text-caption font-medium text-ink-tertiary">Links, and where they lead</h2>
        <span className="grow" />
        {derived > 0 ? (
          <span className="text-caption text-ink-faint">
            the last {derived === 1 ? "one is" : `${derived} are`} derived, not stored
          </span>
        ) : null}
      </header>
      <ul className="mt-1.5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {links.map((link) => (
          <li key={link.key}>
            <LinkCard link={link} href={hrefFor?.(link) ?? null} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LinkCard({ link, href }: { link: ObjectLink; href: string | null }) {
  const tone = link.tone ? TONE[link.tone] : null;
  const empty = link.count === 0;
  const Card = href ? Link : "div";
  return (
    <Card
      href={href as string}
      className={`block rounded-lg border px-3 py-2.5 ${tone?.border ?? "border-hairline"} ${
        link.derived ? "bg-surface" : (tone?.bg ?? "")
      } ${href ? "hover:border-ink-faint" : ""}`}
    >
      <span className="flex items-center gap-[7px]">
        <Icon
          name={link.targetType ? GLYPH_OF[link.targetType] : "graph"}
          size={12}
          className={`shrink-0 ${empty ? "text-ink-faint" : (tone?.glyph ?? "text-ink-tertiary")}`}
        />
        <span className="min-w-0 truncate text-small text-ink-secondary">{link.label}</span>
        <span className="grow" />
        <span className={`text-[14px] font-semibold ${empty ? "text-ink-faint" : (tone?.ink ?? "text-ink")}`}>
          {link.count}
        </span>
      </span>
      {link.sub ? <span className="mt-[3px] block truncate text-caption text-ink-faint">{link.sub}</span> : null}
    </Card>
  );
}
