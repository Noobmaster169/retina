import type { EntityDetail } from "@/lib/api/ontology-schemas";

/**
 * A guide-ruled tree of where a thing sits.
 *
 * Two levels and not more. Every branch here is a link type with a live count
 * behind it; a third level would be the things themselves, which is what
 * `Step to` opens as a list, and drawing fifty of them in a tree would be a
 * worse version of that list.
 */

export function WhereItSits({ detail }: { detail: EntityDetail }) {
  const { row, links } = detail;
  const last = links.length - 1;

  return (
    <aside aria-label="Where it sits" className="flex w-[300px] shrink-0 flex-col overflow-hidden bg-surface">
      <h2 className="flex h-[42px] shrink-0 items-center px-5 text-heading font-semibold tracking-[-0.01em]">
        Where it sits
      </h2>
      <ul className="min-h-0 grow overflow-y-auto px-5 pt-0.5">
        <li className="flex h-8 items-center gap-2">
          <span className="block h-[7px] w-[7px] shrink-0 rounded-xs bg-ink" />
          <span className="min-w-0 truncate text-small font-medium text-ink">{row.name}</span>
          <span className="grow" />
          <span className="font-mono text-[10.5px] text-ink-tertiary">{row.type}</span>
        </li>
        {links.map((link, index) => (
          <li key={link.key} className="flex h-8 items-center gap-2 pl-3">
            <span className="w-[9px] shrink-0 font-mono text-mono-xs text-hairline-strong">
              {index === last ? "└" : "├"}
            </span>
            <span
              className={`block h-[7px] w-[7px] shrink-0 rounded-xs ${
                link.count === 0 ? "bg-hairline-strong" : link.tone === "differ" ? "bg-differ" : "bg-ink-faint"
              }`}
            />
            <span
              className={`min-w-0 truncate text-small ${link.count === 0 ? "text-hairline-strong" : "text-ink-secondary"}`}
            >
              {link.label}
            </span>
            <span className="grow" />
            <span
              className={`shrink-0 font-mono text-[10.5px] ${
                link.count === 0 ? "text-hairline-strong" : link.tone === "differ" ? "text-differ" : "text-ink-tertiary"
              }`}
            >
              {link.count}
            </span>
          </li>
        ))}
      </ul>
      <p className="shrink-0 border-t border-hairline px-5 py-3 text-caption leading-[17px] text-ink-faint">
        Every branch is a link type with a live count behind it. None of it is stored: it is counted when you ask.
      </p>
    </aside>
  );
}
