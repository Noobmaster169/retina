import Link from "next/link";

import { Chip, toneOf } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icons";
import type { EntityDetail } from "@/lib/api/ontology-schemas";
import { formatWhenShort } from "@/lib/when";

import { Meaning } from "@/components/ontology/insight/meaning";

/**
 * What a row opens into, in place: what it means, the ways it has been
 * written, and where it appeared.
 *
 * The stored columns and the links out of it used to be here. They are on the
 * full record now, under the evidence: a reader who opens a row in a list is
 * asking what this one is, not which table holds it. The spellings are the
 * last facet of the meaning, so they are not repeated beside it either.
 *
 * In place rather than on its own page, because the question a reader has at
 * this point is usually about this thing against the ones above and below it.
 * The button at the foot is for when it stops being that question.
 */

export function ThingOpen({ detail, recordHref }: { detail: EntityDetail; recordHref: string }) {
  return (
    <div className="border-b border-hairline bg-surface shadow-[inset_2px_0_0_0_var(--ink)]">
      <div className="px-7 pt-2 pb-[22px]">
        <Meaning insight={detail.insight} hrefFor={() => null} stale={detail.profile?.stale ?? false} />
      </div>

      <div className="mx-7 mb-5 border-t border-hairline pt-3">
        <div className="flex items-center gap-2.5">
          <h3 className="text-caption font-medium text-ink-tertiary">Where it appeared</h3>
          <span className="text-caption text-ink-faint">
            last {Math.min(3, detail.appearances.length)} of {detail.appearanceCount}
          </span>
          <span className="grow" />
          <Link
            href={recordHref}
            className="flex h-[30px] items-center gap-2 rounded-md bg-ink px-[11px] text-small font-medium text-ink-inverse"
          >
            Open the full record
            <Icon name="chevron" size={11} />
          </Link>
        </div>
        <ul>
          {detail.appearances.slice(0, 3).map((appearance) => (
            <li key={`${appearance.emailId}-${appearance.field}`}>
              <Link
                href={`/runs/${appearance.runId}/emails/${appearance.emailId}`}
                className="flex h-[34px] items-center gap-3 border-t border-hairline-faint hover:bg-active"
              >
                <span className="w-24 shrink-0 text-caption text-ink-faint">{formatWhenShort(appearance.seenAt)}</span>
                <span className="w-[78px] shrink-0 font-mono text-mono-xs text-ink-secondary">{appearance.emailId}</span>
                <span className="w-[120px] shrink-0 truncate font-mono text-[10.5px] text-ink-faint">{appearance.field}</span>
                <span className="min-w-0 grow truncate text-small text-ink-secondary">{appearance.subject}</span>
                <Chip tone={toneOf(appearance.outcome)} mono>
                  {appearance.outcome ?? "no check"}
                </Chip>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
