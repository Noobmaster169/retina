import Link from "next/link";

import { GLYPH_OF } from "@/components/graph/glyphs";
import { Icon } from "@/components/ui/icons";
import type { ObjectTypeSummary } from "@/lib/api/ontology-schemas";

/**
 * The second rail: every type the model knows, with its live count.
 *
 * A type the schema does not hold yet is drawn dashed and faint rather than
 * left off. Designing the navigation around only the built types would
 * understate the model, and drawing a Shipment as though it existed would
 * overstate it; dashed is the only honest third option.
 */

interface TypeRailProps {
  types: ObjectTypeSummary[];
  /** Which type is being read, or null on a page that is not about one. */
  active: string | null;
  /** Where a type leads. Null makes the whole list inert, for a page that only names them. */
  hrefFor?: (type: ObjectTypeSummary) => string | null;
  heading: string;
  footnote: string;
}

export function TypeRail({ types, active, hrefFor, heading, footnote }: TypeRailProps) {
  return (
    <nav aria-label={heading} className="flex w-[200px] shrink-0 flex-col border-r border-hairline bg-surface">
      <div className="flex h-[26px] items-center px-[18px] pt-1.5 text-caption font-medium text-ink-tertiary">
        {heading}
      </div>
      <ul className="min-h-0 grow overflow-y-auto px-2.5 py-1">
        {types.map((type) => (
          <li key={type.type}>
            <TypeRow type={type} active={type.type === active} href={hrefFor?.(type) ?? null} />
          </li>
        ))}
      </ul>
      <p className="border-t border-hairline px-[18px] py-3.5 text-caption leading-[17px] text-ink-faint">{footnote}</p>
    </nav>
  );
}

function TypeRow({ type, active, href }: { type: ObjectTypeSummary; active: boolean; href: string | null }) {
  const planned = !type.built;
  const shell = [
    "flex h-[34px] items-center gap-2.5 rounded-md px-2.5",
    active ? "bg-active" : href ? "hover:bg-sunken" : "",
    planned ? "border border-dashed border-hairline-strong" : "",
  ].join(" ");

  const body = (
    <>
      <Icon name={GLYPH_OF[type.type]} size={14} className={planned ? "text-ink-faint" : active ? "text-ink" : "text-ink-tertiary"} />
      <span className={`text-strong ${planned ? "text-ink-faint" : active ? "font-medium text-ink" : "text-ink-secondary"}`}>
        {type.label}
      </span>
      <span className="grow" />
      <span className={`font-mono text-mono-xs ${planned ? "text-ink-faint" : "text-ink-tertiary"}`}>
        {planned ? "planned" : type.count.toLocaleString()}
      </span>
    </>
  );

  if (!href || planned) {
    return (
      <span className={shell} title={planned ? "Designed and not built: nothing in the seven fields yields one yet" : undefined}>
        {body}
      </span>
    );
  }
  return (
    <Link href={href} className={shell} aria-current={active ? "page" : undefined}>
      {body}
    </Link>
  );
}
