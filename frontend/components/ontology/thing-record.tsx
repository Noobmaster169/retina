import { AppearanceList } from "@/components/database/appearance-list";
import { WhereItSits } from "@/components/database/where-it-sits";
import { WrittenTheseWays } from "@/components/database/written-these-ways";
import type { EntityDetail } from "@/lib/api/ontology-schemas";
import { formatWhen } from "@/lib/when";

/**
 * A resolved thing as a page: what is known, the ways it has been written and
 * who joined them, every appearance with the field it filled and how that email
 * ended, and a tree of where it sits.
 *
 * The line this page exists to make: nobody typed any of it in.
 */

export function ThingRecord({ detail, type }: { detail: EntityDetail; type: "port" | "party" }) {
  const { row } = detail;
  const tiles = [
    { label: "Read from", value: row.mentions, sub: "documents" },
    { label: "Emails", value: row.emails, sub: "name it" },
    { label: "Spellings", value: row.names, sub: "judged one" },
    { label: "Differences", value: detail.links.find((link) => link.key === "differed")?.count ?? 0, sub: "about it" },
  ];

  return (
    <>
      <div className="flex h-[104px] shrink-0 items-center gap-4 border-b border-hairline px-7">
        {/* grow, not a spacer beside it: a name is the longest thing on this
            row and without it the tiles take the width and the title truncates. */}
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
        {tiles.map((tile) => (
          <div key={tile.label} className="w-[104px] shrink-0 border-l border-hairline pl-3.5">
            <div className="text-caption text-ink-tertiary">{tile.label}</div>
            <div className="mt-[3px] flex items-baseline gap-1.5">
              <span className={`text-[22px] font-semibold tracking-[-0.02em] ${tile.value === 0 ? "text-ink-faint" : "text-ink"}`}>
                {tile.value}
              </span>
              <span className="text-caption text-ink-faint">{tile.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex min-h-0 grow overflow-hidden">
        <Known detail={detail} />
        <AppearanceList appearances={detail.appearances} total={detail.appearanceCount} />
        <WhereItSits detail={detail} />
      </div>
    </>
  );
}

function Known({ detail }: { detail: EntityDetail }) {
  return (
    <div className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-r border-hairline">
      <h2 className="flex h-[42px] shrink-0 items-center px-[22px] text-heading font-semibold tracking-[-0.01em]">
        What is known
      </h2>
      <dl className="px-[22px]">
        {detail.values.map((value) => (
          <div key={value.key} className="border-t border-hairline-faint py-[9px]">
            <dt className="font-mono text-[10.5px] text-ink-faint">{value.key}</dt>
            <dd className={`mt-[3px] text-small leading-[18px] ${value.value === null ? "text-ink-faint" : "text-ink"}`}>
              {value.value === null ? "not set" : value.valueType === "date" ? formatWhen(value.value) : value.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="px-[22px] pt-4 pb-6">
        <WrittenTheseWays names={detail.names} />
      </div>
    </div>
  );
}
