import Link from "next/link";

import { Chip } from "@/components/ui/chip";
import type { ObjectRecord } from "@/lib/api/ontology-schemas";

import { LinkCards } from "./link-cards";
import { StoredValues } from "./stored-values";

/**
 * One object's stored values and the links out of it.
 *
 * One column. The canvas drew a column configurator down the right side, and
 * it went: it configured a list of eleven values, its Add menu offered three
 * kinds of column that do not exist, and two of its three tabs were dead. What
 * is left is the part that was making the argument, which is the `written by`
 * column saying which values the sender supplied, which a model decided, which
 * code derived, and which nothing ever wrote.
 */

export function RecordTab({ record }: { record: ObjectRecord }) {
  return (
    <div className="min-h-0 grow overflow-y-auto">
      <div className="mx-auto max-w-[900px] px-6 pt-5 pb-8">
        <div className="flex items-center gap-2.5">
          {record.badges.map((badge) => (
            <Chip key={badge.label} tone={badge.tone === "ink" ? "neutral" : badge.tone} mono={badge.tone !== "neutral"}>
              {badge.label}
            </Chip>
          ))}
          <span className="grow" />
          {record.openHref ? (
            <Link href={record.openHref} className="text-small text-ink-tertiary underline-offset-2 hover:text-ink hover:underline">
              Open it outside the ontology
            </Link>
          ) : null}
        </div>

        <h1 className="mt-2 font-display text-display font-normal tracking-[-0.01em]">{record.title}</h1>
        <p className="mt-0.5 max-w-[68ch] text-heading text-ink-tertiary">{record.blurb}</p>

        <div className="mt-5">
          <StoredValues values={record.values} />
        </div>

        <div className="mt-[18px]">
          <LinkCards links={record.links} />
        </div>
      </div>
    </div>
  );
}
