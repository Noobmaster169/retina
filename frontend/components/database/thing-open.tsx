import Link from "next/link";

import { Chip, toneOf } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icons";
import type { EntityDetail } from "@/lib/api/ontology-schemas";
import { formatWhen, formatWhenShort } from "@/lib/when";

import { WrittenTheseWays } from "./written-these-ways";

/**
 * What a row opens into, in place: what is stored, step out from here, written
 * these ways, and where it appeared.
 *
 * In place rather than on its own page, because the question a reader has at
 * this point is usually about this thing against the ones above and below it.
 * The button at the foot is for when it stops being that question.
 */

export function ThingOpen({ detail, runId }: { detail: EntityDetail; runId: string }) {
  const { row } = detail;
  return (
    <div className="border-b border-hairline bg-surface shadow-[inset_2px_0_0_0_var(--ink)]">
      <div className="flex gap-7 px-7 pt-1 pb-[22px]">
        <section className="w-[300px] shrink-0">
          <h3 className="text-caption font-medium text-ink-tertiary">What is stored</h3>
          <dl>
            {detail.values.map((value) => (
              <div key={value.key} className="flex h-8 items-center gap-2.5 border-b border-hairline-faint">
                <dt className="w-24 shrink-0 font-mono text-mono-xs text-ink-faint">{value.key}</dt>
                <dd className={`min-w-0 truncate text-small ${value.value === null ? "text-ink-faint" : "text-ink-secondary"}`}>
                  {value.value === null ? "not set" : value.valueType === "date" ? formatWhen(value.value) : value.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 rounded-lg border border-hairline bg-canvas px-3 py-2.5 text-caption leading-[17px] text-ink-tertiary">
            Nobody typed this in. It exists because the model read it out of {row.mentions}{" "}
            {row.mentions === 1 ? "document" : "documents"} and the judge accepted the spellings below as the same
            thing.
          </p>
        </section>

        <section className="w-[392px] shrink-0">
          <h3 className="text-caption font-medium text-ink-tertiary">Step out from here</h3>
          <ul>
            {detail.links.map((link) => (
              <li key={link.key} className="flex h-[38px] items-center gap-2.5 border-b border-hairline-faint">
                <Icon name="graph" size={13} className="shrink-0 text-hairline-strong" />
                <span className="min-w-0 grow">
                  <span className="block truncate text-small text-ink-secondary">{link.label}</span>
                  <span className="block font-mono text-[10px] text-hairline-strong">{link.sub}</span>
                </span>
                <span
                  className={`shrink-0 text-[14px] font-medium ${
                    link.count === 0 ? "text-hairline-strong" : link.tone === "differ" ? "text-differ" : "text-ink"
                  }`}
                >
                  {link.count}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <WrittenTheseWays names={detail.names} />
      </div>

      <div className="mx-7 mb-5 border-t border-hairline pt-3">
        <div className="flex items-center gap-2.5">
          <h3 className="text-caption font-medium text-ink-tertiary">Where it appeared</h3>
          <span className="text-caption text-ink-faint">
            last {Math.min(3, detail.appearances.length)} of {detail.appearanceCount}
          </span>
          <span className="grow" />
          <Link
            href={`/runs/${runId}/database/${row.type}/${row.id}`}
            className="flex h-[30px] items-center gap-2 rounded-md bg-ink px-[11px] text-small font-medium text-ink-inverse"
          >
            Open the full record
            <Icon name="chevron" size={11} />
          </Link>
        </div>
        <ul>
          {detail.appearances.slice(0, 3).map((appearance) => (
            <li key={`${appearance.emailId}-${appearance.field}-${appearance.seenAt}`}>
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
