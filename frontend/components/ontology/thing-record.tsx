import { AppearanceList } from "@/components/database/appearance-list";
import { Meaning } from "@/components/ontology/insight/meaning";
import type { InsightLine } from "@/lib/api/insight-schemas";
import type { EntityDetail } from "@/lib/api/ontology-schemas";
import type { EntityKind } from "@/lib/api/semantic-schemas";

import { ThingEvidence } from "./thing-evidence";

/**
 * A resolved thing as a page: what it means, and every appearance with the
 * field it filled and how that email ended.
 *
 * The line this page exists to make: nobody typed any of it in. What used to
 * lead it was four tiles of plumbing (read from, emails, spellings,
 * differences), a list of stored columns and a tree of link counts. All three
 * are still here, under `ThingEvidence`, where a reader goes to check a claim
 * rather than to learn what the thing is. Two columns and not three, because
 * this page sits between two rails and the third was 280px the appearances
 * needed.
 */

export function ThingRecord({ detail, type, base }: { detail: EntityDetail; type: EntityKind; base?: string }) {
  const { row, insight } = detail;
  const hrefFor = (line: InsightLine): string | null => {
    if (!line.target || !base) return null;
    return `${base.replace(/type=[a-z]+/, `type=${line.target.kind}`)}&id=${encodeURIComponent(line.target.id)}&tab=record`;
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-4 border-b border-hairline px-7 py-5">
        <div className="min-w-0 grow">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-5 items-center rounded-xs bg-sunken px-1.5 font-mono text-[10.5px] text-ink-tertiary">
              {type}
            </span>
            <span className="inline-flex h-5 items-center rounded-xs bg-sunken px-1.5 text-[10.5px] text-ink-tertiary">
              read, never typed
            </span>
          </div>
          <h1 className="mt-1 truncate font-display text-[28px] leading-[34px] font-normal tracking-[-0.01em]">
            {row.name}
          </h1>
        </div>
      </div>

      <div className="flex min-h-0 grow overflow-hidden">
        <div className="flex w-[400px] shrink-0 flex-col overflow-y-auto border-r border-hairline px-[22px] py-4">
          <Meaning insight={insight} hrefFor={hrefFor} stale={detail.profile?.stale ?? false} />
          <ThingEvidence detail={detail} />
        </div>
        <AppearanceList appearances={detail.appearances} total={detail.appearanceCount} />
      </div>
    </>
  );
}
