import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppearanceList } from "@/components/database/appearance-list";
import { WhereItSits } from "@/components/database/where-it-sits";
import { WrittenTheseWays } from "@/components/database/written-these-ways";
import { AppShell } from "@/components/shell/app-shell";
import { TopBar } from "@/components/shell/top-bar";
import { Icon } from "@/components/ui/icons";
import { getEntityDetail, listEntities } from "@/lib/api-client";
import type { EntityDetail, EntityRow } from "@/lib/api/ontology-schemas";
import { formatWhen } from "@/lib/when";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Record · Retina SDOC" };

const RUN_ID = /^[0-9a-f-]{36}$/;

/**
 * A thing as a page: what is known, the ways it has been written and who
 * joined them, every appearance with the field it filled and how that email
 * ended, and a tree of where it sits.
 *
 * The line this page exists to make: nobody typed any of it in.
 */
export default async function Page({ params }: PageProps<"/runs/[id]/database/[type]/[entityId]">) {
  const { id, type, entityId } = await params;
  if (!RUN_ID.test(id) || (type !== "port" && type !== "party")) notFound();

  const [detail, list] = await Promise.all([getEntityDetail(type, entityId), listEntities(type)]);
  if (!detail) notFound();

  const plural = type === "port" ? "Ports" : "Parties";

  return (
    <AppShell active="database" runId={id} counts={{}}>
      <PeerRail rows={list.entities} runId={id} type={type} openId={entityId} plural={plural} />

      <div className="flex min-w-0 grow flex-col">
        <TopBar
          crumbs={[
            { label: "Database", href: `/runs/${id}/database` },
            { label: plural, href: `/runs/${id}/database?view=things&type=${type}` },
            { label: detail.row.name },
          ]}
        >
          <Link
            href={`/runs/${id}/database?view=things&type=${type}&id=${entityId}`}
            className="flex h-[30px] items-center rounded-md border border-hairline px-2.5 text-small text-ink-secondary hover:border-hairline-strong"
          >
            Back to the list
          </Link>
          <Link
            href={`/runs/${id}/chat`}
            className="flex h-[30px] items-center gap-[7px] rounded-md border border-review-line px-2.5 text-small text-review hover:bg-review-tint"
          >
            <Icon name="chat" size={13} />
            Ask about this {type}
          </Link>
        </TopBar>

        <Hero detail={detail} type={type} />

        <div className="flex min-h-0 grow overflow-hidden">
          <Known detail={detail} />
          <AppearanceList appearances={detail.appearances} total={detail.appearanceCount} />
          <WhereItSits detail={detail} />
        </div>
      </div>
    </AppShell>
  );
}

function Hero({ detail, type }: { detail: EntityDetail; type: "port" | "party" }) {
  const { row } = detail;
  const tiles = [
    { label: "Read from", value: row.mentions, sub: "documents" },
    { label: "Emails", value: row.emails, sub: "name it" },
    { label: "Spellings", value: row.names, sub: "judged one" },
    { label: "Differences", value: detail.links.find((link) => link.key === "differed")?.count ?? 0, sub: "about it" },
  ];
  return (
    <div className="flex h-[104px] shrink-0 items-center gap-[22px] border-b border-hairline px-7">
      {/* grow, not a spacer beside it: a name is the longest thing on this row
          and without it the tiles take the width and the title truncates. */}
      <div className="min-w-0 grow">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-5 items-center rounded-xs bg-sunken px-1.5 font-mono text-[10.5px] text-ink-tertiary">
            {type}
          </span>
          <span className="inline-flex h-5 items-center rounded-xs bg-sunken px-1.5 text-[10.5px] text-ink-tertiary">
            read, never typed
          </span>
        </div>
        <h1 className="mt-1 truncate font-display text-[32px] leading-[38px] font-normal tracking-[-0.01em]">
          {row.name}
        </h1>
      </div>
      {tiles.map((tile) => (
        <div key={tile.label} className="w-[126px] shrink-0 border-l border-hairline pl-4">
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
  );
}

function Known({ detail }: { detail: EntityDetail }) {
  return (
    <div className="flex w-[330px] shrink-0 flex-col overflow-y-auto border-r border-hairline">
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

function PeerRail({
  rows,
  runId,
  type,
  openId,
  plural,
}: {
  rows: EntityRow[];
  runId: string;
  type: "port" | "party";
  openId: string;
  plural: string;
}) {
  return (
    <nav aria-label={plural} className="flex w-[232px] shrink-0 flex-col border-r border-hairline bg-surface">
      <div className="flex h-[26px] shrink-0 items-center px-[18px] pt-1.5 text-caption font-medium text-ink-tertiary">
        {plural}
      </div>
      <ul className="min-h-0 grow overflow-y-auto px-2.5 py-1">
        {rows.map((row) => {
          const open = row.id === openId;
          return (
            <li key={row.id}>
              <Link
                href={`/runs/${runId}/database/${type}/${row.id}`}
                aria-current={open ? "page" : undefined}
                className={`flex h-10 items-center gap-2.5 rounded-md px-2.5 ${open ? "bg-active" : "hover:bg-sunken"}`}
              >
                <span className="min-w-0 grow">
                  <span className={`block truncate text-small ${open ? "font-medium text-ink" : "text-ink-secondary"}`}>
                    {row.name}
                  </span>
                  <span className="block text-[10.5px] text-ink-faint">
                    {row.names} {row.names === 1 ? "spelling" : "spellings"}
                  </span>
                </span>
                <span className="font-mono text-[10.5px] text-ink-faint">{row.mentions}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="shrink-0 border-t border-hairline px-[18px] py-3.5 text-caption leading-[17px] text-ink-faint">
        {rows.length} {rows.length === 1 ? "thing" : "things"}, none of them typed in. Each one is a set of spellings
        the field judge agreed denote the same thing.
      </p>
    </nav>
  );
}
