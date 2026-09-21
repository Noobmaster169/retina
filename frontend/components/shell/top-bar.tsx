import Link from "next/link";
import type { ReactNode } from "react";

import { DockToggle } from "@/components/dock/dock-toggle";

/**
 * The 56px top bar. The breadcrumb is the ontology path, not a page path:
 * every segment names a thing in the model, and the last one is the thing
 * being looked at. docs/05-design.md section 7.
 */

export interface Crumb {
  label: string;
  href?: string;
  /** An id, set in mono. The last segment of most paths. */
  mono?: boolean;
}

export function TopBar({ crumbs, children }: { crumbs: Crumb[]; children?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-hairline px-6">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2.5">
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-2.5">
            {index > 0 ? (
              <span className="text-strong text-ink-faint" aria-hidden="true">
                /
              </span>
            ) : null}
            <Crumbed crumb={crumb} last={index === crumbs.length - 1} />
          </span>
        ))}
      </nav>
      <span className="grow" />
      {children}
      <DockToggle />
    </header>
  );
}

function Crumbed({ crumb, last }: { crumb: Crumb; last: boolean }) {
  const type = crumb.mono ? "font-mono text-strong font-medium" : "text-strong";
  const ink = last ? "text-ink" : "text-ink-tertiary";
  const label = <span className={`truncate ${type} ${ink}`}>{crumb.label}</span>;
  if (!crumb.href || last) return label;
  return (
    <Link href={crumb.href} className="truncate transition-colors duration-150 hover:text-ink">
      {label}
    </Link>
  );
}

/** The search field. Inert in phase 7: the command palette it opens is phase 10. */
export function Search() {
  return (
    <>
      <label htmlFor="retina-search" className="sr-only">
        Search
      </label>
      <input
        id="retina-search"
        type="search"
        placeholder="Search"
        disabled
        title="Search arrives with the chat, in phase 10"
        className="h-8 w-[200px] rounded-md border border-hairline bg-sunken px-2.5 text-strong text-ink-secondary placeholder:text-ink-faint disabled:cursor-not-allowed"
      />
    </>
  );
}
