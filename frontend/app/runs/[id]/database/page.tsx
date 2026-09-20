import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DatabaseHeader } from "@/components/database/database-header";
import { RowDrawer } from "@/components/database/row-drawer";
import { RowGrid } from "@/components/database/row-grid";
import { SchemaRail } from "@/components/database/schema-rail";
import { ThingList } from "@/components/database/thing-list";
import { AppShell } from "@/components/shell/app-shell";
import {
  getEntityDetail,
  getRowDetail,
  getTablePage,
  listEntities,
  listObjectTypes,
  listTables,
} from "@/lib/api-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Database · Retina SDOC" };

const RUN_ID = /^[0-9a-f-]{36}$/;
const PAGE_SIZE = 50;

/** What a reader of this page most likely wants first: the emails, as rows. */
const DEFAULT_TABLE = { schema: "core" as const, name: "emails" };

function one(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * One page, two ways in, and the record underneath.
 *
 * Hidden from the rail: browsing raw tables is a flow nobody needs beside the
 * ontology, which answers the same questions in the model's own words. It is
 * kept and reachable by URL because `As rows` is the page that proves the
 * ontology is not a mock-up, and a demo may still want to open it.
 *
 * Which half you are reading, which table or type, and which row is open are
 * all in the URL. That makes every view shareable, back work, and a reload
 * land where you were, and it is why this whole page is a server component
 * with no client state in it at all.
 */
export default async function Page({ params, searchParams }: PageProps<"/runs/[id]/database">) {
  const { id } = await params;
  if (!RUN_ID.test(id)) notFound();
  const asked = await searchParams;

  const wantedType = one(asked.type);
  const view = one(asked.view) === "things" || (wantedType && one(asked.view) !== "rows") ? "things" : "rows";

  const [types, tables] = await Promise.all([listObjectTypes(), listTables()]);

  if (view === "things") {
    return <Things runId={id} types={types} tables={tables} type={wantedType} openId={one(asked.id)} />;
  }

  const schema = one(asked.schema) === "analytics" ? "analytics" : "core";
  const name = one(asked.table) ?? DEFAULT_TABLE.name;
  const row = one(asked.row);

  const [page, detail] = await Promise.all([
    getTablePage(schema, name, { limit: PAGE_SIZE }),
    row ? getRowDetail(schema, name, row) : Promise.resolve(null),
  ]);
  if (!page) notFound();

  const base = `/runs/${id}/database?view=rows&schema=${schema}&table=${name}`;

  return (
    <AppShell active="database" runId={id} counts={{}}>
      <SchemaRail types={types} tables={tables} runId={id} activeType={null} activeTable={`${schema}.${name}`} />
      <div className="flex min-w-0 grow flex-col">
        <DatabaseHeader
          runId={id}
          view="rows"
          crumbs={[{ label: "Database" }, { label: schema, mono: true }, { label: name, mono: true }]}
          otherHref={`/runs/${id}/database?view=things&type=port`}
          count={`${page.total.toLocaleString()} rows`}
        />
        <div className="flex min-h-0 grow">
          <RowGrid page={page} selectedId={row} hrefFor={(value) => `${base}&row=${encodeURIComponent(value)}`} />
          {detail ? <RowDrawer detail={detail} runId={id} closeHref={base} /> : null}
        </div>
      </div>
    </AppShell>
  );
}

/** The same data as records the model built, one open in place. */
async function Things({
  runId,
  types,
  tables,
  type,
  openId,
}: {
  runId: string;
  types: Awaited<ReturnType<typeof listObjectTypes>>;
  tables: Awaited<ReturnType<typeof listTables>>;
  type: string | null;
  openId: string | null;
}) {
  // Only a port and a party are resolved things with an index of their own.
  // Everything else is a table, and the rows half is where it is read.
  const kind = type === "party" ? "party" : "port";
  const [list, detail] = await Promise.all([
    listEntities(kind),
    openId ? getEntityDetail(kind, openId) : Promise.resolve(null),
  ]);
  const descriptor = types.find((entry) => entry.type === kind);
  const base = `/runs/${runId}/database?view=things&type=${kind}`;

  return (
    <AppShell active="database" runId={runId} counts={{}}>
      <SchemaRail types={types} tables={tables} runId={runId} activeType={kind} activeTable={null} />
      <div className="flex min-w-0 grow flex-col">
        <DatabaseHeader
          runId={runId}
          view="things"
          crumbs={[{ label: "Database" }, { label: descriptor?.label ?? kind }]}
          otherHref={`/runs/${runId}/database?view=rows&schema=core&table=emails`}
          count={`${list.entities.length} ${list.entities.length === 1 ? "thing" : "things"}`}
        />
        <div className="px-7 py-5">
          <h1 className="font-display text-display font-normal tracking-[-0.01em]">{descriptor?.label ?? kind}</h1>
          <p className="mt-0.5 max-w-[78ch] text-heading text-ink-tertiary">{blurbFor(kind, list.entities.length)}</p>
        </div>
        <ThingList
          rows={list.entities}
          openId={openId}
          detail={detail}
          hrefFor={(value) => (value ? `${base}&id=${encodeURIComponent(value)}` : base)}
          recordHrefFor={(value) => `/runs/${runId}/ontology?type=${kind}&id=${encodeURIComponent(value)}&tab=record`}
        />
      </div>
    </AppShell>
  );
}

function blurbFor(kind: "port" | "party", count: number): string {
  const what = kind === "port" ? "places" : "companies";
  const fields = kind === "port" ? "loading and discharge fields" : "shipper, consignee and notify party fields";
  return `${count} ${what}, read out of the ${fields} of every document that was proved. Nobody typed any of them in.`;
}
