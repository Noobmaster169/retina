"use client";

import Link from "next/link";
import { useState } from "react";

import { LinkCards } from "@/components/ontology/link-cards";
import { LinksTab } from "@/components/ontology/links-tab";
import { StoredValues } from "@/components/ontology/stored-values";
import { TypeRail } from "@/components/ontology/type-rail";
import { ValueConfig } from "@/components/ontology/value-config";
import { AppShell } from "@/components/shell/app-shell";
import { TopBar } from "@/components/shell/top-bar";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icons";
import type { ObjectGraph, ObjectRecord, ObjectTypeSummary } from "@/lib/api/ontology-schemas";

/**
 * One record, two ways to read it.
 *
 * The third tab the canvas first drew, rows and columns, was cut: the database
 * page does that job and does it better, and two pages competing to be the
 * table view is how a product ends up with neither being good.
 */

interface OntologyPageProps {
  runId: string;
  types: ObjectTypeSummary[];
  record: ObjectRecord;
  /** One hop out, and two. Both are fetched with the page so the control is instant and needs no spinner. */
  graph: ObjectGraph | null;
  graphTwoHops: ObjectGraph | null;
}

type Tab = "record" | "links";

export function OntologyPage({ runId, types, record, graph, graphTwoHops }: OntologyPageProps) {
  const [tab, setTab] = useState<Tab>("record");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [twoHops, setTwoHops] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);

  const emailType = types.find((type) => type.type === record.type) ?? types[0];
  const shown = record.values.filter((value) => !hidden.has(value.key));
  const drawn = (twoHops ? graphTwoHops : graph) ?? graph;
  const selected = drawn?.nodes.find((node) => node.id === selectedId) ?? drawn?.nodes.find((node) => node.focal) ?? null;

  return (
    <AppShell active="ontology" runId={runId} counts={{}}>
      {/*
        The Links canvas takes the width the object types rail would have had.
        GraphLinks.dc.html has one rail and 868px of canvas, and squeezing a
        second rail in beside it left the graph too small to read the labels
        this page exists to draw.
      */}
      {tab === "record" ? (
        <TypeRail
          types={types}
          active={record.type}
          heading="Object types"
          footnote="Two types are designed and not yet stored. They show dashed."
          hrefFor={(type) => (type.built ? `/runs/${runId}/database?type=${type.type}` : null)}
        />
      ) : null}

      <div className="flex min-w-0 grow flex-col">
        <TopBar
          crumbs={[
            { label: "Object types", href: `/runs/${runId}/database` },
            { label: emailType?.label ?? record.type },
            { label: record.id, mono: true },
          ]}
        >
          {tab === "links" ? (
            <>
              <button type="button" onClick={() => setFitSignal((was) => was + 1)} className={CONTROL}>
                Fit
              </button>
              <button
                type="button"
                onClick={() => setTwoHops((was) => !was)}
                aria-pressed={twoHops}
                disabled={!graphTwoHops}
                className={`${CONTROL} ${twoHops ? "border-ink bg-active font-medium text-ink" : ""} disabled:cursor-not-allowed disabled:text-ink-faint`}
              >
                Two hops
              </button>
            </>
          ) : null}
          {record.openHref ? (
            <Link href={record.openHref} className={CONTROL}>
              Open the email
            </Link>
          ) : null}
        </TopBar>

        <div className="flex h-11 shrink-0 items-stretch gap-6 border-b border-hairline px-6">
          <TabButton icon="doc" label="Record" active={tab === "record"} onClick={() => setTab("record")} />
          <TabButton icon="graph" label="Links" active={tab === "links"} onClick={() => setTab("links")} />
          <span className="grow" />
          <span className="self-center text-small text-ink-faint">The same record, two ways to read it</span>
        </div>

        {tab === "record" ? (
          <div className="flex min-h-0 grow">
            <div className="flex min-w-0 grow flex-col overflow-y-auto">
              <div className="px-6 pt-5 pb-3.5">
                <div className="flex items-center gap-2.5">
                  {record.badges.map((badge) => (
                    <Chip key={badge.label} tone={badge.tone === "ink" ? "neutral" : badge.tone} mono={badge.tone !== "neutral"}>
                      {badge.label}
                    </Chip>
                  ))}
                </div>
                <h1 className="mt-2 font-display text-display font-normal tracking-[-0.01em]">{record.title}</h1>
                <p className="mt-0.5 text-heading text-ink-tertiary">{record.blurb}</p>
              </div>
              <div className="px-6">
                <StoredValues values={shown} />
              </div>
              <div className="px-6 pt-[18px] pb-8">
                <LinkCards links={record.links} />
              </div>
            </div>
            {emailType ? (
              <ValueConfig
                type={emailType}
                values={record.values}
                hidden={hidden}
                onToggle={(key) =>
                  setHidden((was) => {
                    const next = new Set(was);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
              />
            ) : null}
          </div>
        ) : (
          <LinksTab
            runId={runId}
            graph={drawn}
            record={record}
            selected={selected}
            selectedId={selectedId}
            onSelect={setSelectedId}
            fitSignal={fitSignal}
          />
        )}
      </div>
    </AppShell>
  );
}

const CONTROL =
  "flex h-8 items-center rounded-md border border-hairline-strong px-3 text-strong text-ink-secondary hover:border-ink-faint";

function TabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: "doc" | "graph";
  label: string;
  active: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 text-heading ${
        active ? "font-medium text-ink shadow-[inset_0_-2px_0_0_var(--ink)]" : "text-ink-secondary hover:text-ink"
      }`}
    >
      <Icon name={icon} size={14} className={active ? "text-ink" : "text-ink-faint"} />
      <span>{label}</span>
    </button>
  );
}
