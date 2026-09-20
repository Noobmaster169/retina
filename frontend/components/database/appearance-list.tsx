import Link from "next/link";

import { Chip, toneOf } from "@/components/ui/chip";
import type { EntityAppearance } from "@/lib/api/ontology-schemas";
import { formatWhen } from "@/lib/when";

/**
 * Every time a thing was read, newest first, one line each: the email, the
 * field it filled and how that email ended. The subject is left off; the email
 * id opens it.
 *
 * The outcome is the comparison's, joined live rather than copied onto the
 * mention. A status stored here would drift the moment somebody corrected the
 * email, and a page that disagrees with the email it links to is worse than a
 * page that has to do a join.
 */

export function AppearanceList({ appearances, total }: { appearances: EntityAppearance[]; total: number }) {
  return (
    <section className="flex min-w-0 grow flex-col overflow-hidden border-r border-hairline">
      <h2 className="flex h-[42px] shrink-0 items-center gap-2.5 px-[22px]">
        <span className="text-heading font-semibold tracking-[-0.01em]">When it appeared</span>
        <span className="grow" />
        <span className="text-caption text-ink-faint">
          {appearances.length === total ? `all ${total}` : `last ${appearances.length} of ${total}`}
        </span>
      </h2>
      <ul className="min-h-0 grow overflow-y-auto">
        {appearances.map((appearance) => (
          <li key={`${appearance.emailId}-${appearance.field}`}>
            <Link
              href={`/runs/${appearance.runId}/emails/${appearance.emailId}`}
              className="flex h-11 items-center gap-3 border-t border-hairline-faint px-[22px] hover:bg-surface"
            >
              <span className="w-[76px] shrink-0">
                <span className="block text-caption text-ink-tertiary">{formatWhen(appearance.seenAt, false)}</span>
                <span className="block font-mono text-[10.5px] text-hairline-strong">
                  {appearance.seenAt.slice(11, 16)}
                </span>
              </span>
              {/* The spine, tinted by how the email ended. A rule, never a dot. */}
              <span
                className={`block h-[26px] w-0.5 shrink-0 rounded-xs ${
                  appearance.outcome === "MISMATCH"
                    ? "bg-differ"
                    : appearance.outcome === "NEEDS_REVIEW"
                      ? "bg-review"
                      : appearance.outcome === "OK"
                        ? "bg-match"
                        : "bg-hairline-strong"
                }`}
              />
              <span className="w-[76px] shrink-0 font-mono text-mono-xs text-ink-secondary">{appearance.emailId}</span>
              <span className="inline-flex h-[18px] shrink-0 items-center rounded-xs bg-sunken px-1.5 font-mono text-[10px] text-ink-tertiary">
                {appearance.field}
              </span>
              <span className="min-w-0 grow truncate text-caption text-ink-faint">
                read from {appearance.sides.length === 0 ? "a document" : appearance.sides.join(" and ")} as{" "}
                {appearance.value}
              </span>
              <Chip tone={toneOf(appearance.outcome)} mono>
                {appearance.outcome ?? "no check"}
              </Chip>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
