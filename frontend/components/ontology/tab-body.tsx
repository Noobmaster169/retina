import { ThingList } from "@/components/database/thing-list";
import { isResolved } from "@/components/graph/glyphs";
import { getEntityDetail, getObjectGraph, getObjectRecord, getShipment, listEntities, listRunEmails, listShipments } from "@/lib/api-client";
import type { ObjectType } from "@/lib/api/ontology-schemas";

import { OntologyEmailList } from "./email-list";
import { ShipmentList } from "./shipment-list";
import { ShipmentRecord } from "./shipment-record";
import { LinksTab } from "./links-tab";
import { RecordTab } from "./record-tab";
import type { EntityKind } from "@/lib/api/semantic-schemas";

import type { OntologyTab } from "./tabs";
import { ThingRecord } from "./thing-record";

/**
 * Which body a tab draws, and the only place that knows a port is read
 * differently from an email.
 *
 * Split from the page because the page routes and the page is the shell; this
 * fetches. It is a function rather than a component so it can await before it
 * returns, which is what lets each tab load only what it needs instead of the
 * page loading everything for whichever tab happens to be open.
 */

/**
 * Which kinds are resolved things rather than tables. One list, in
 * components/graph/glyphs.ts, because the rail, the graph and this all have to
 * agree: a second copy here is what left Carriers saying "not built yet" for a
 * phase after the resolver had learned them.
 */
function resolved(type: string): boolean {
  return isResolved(type as ObjectType);
}

interface BodyProps {
  runId: string;
  type: string;
  selected: string | null;
  tab: OntologyTab;
  emails: Awaited<ReturnType<typeof listRunEmails>>["emails"];
  base: string;
  /** How far the graph reaches. A URL parameter, so `Two hops` is a link and needs no client state. */
  hops: 1 | 2;
}

export async function tabBody({ runId, type, selected, tab, emails, base, hops }: BodyProps) {
  if (tab === "things") return things({ type, selected, emails, base });
  if (!selected) return <Nothing>Pick one from Things to read its record.</Nothing>;

  if (type === "shipment") {
    const detail = await getShipment(selected);
    if (!detail) return <Nothing>No shipment has that id.</Nothing>;
    return <ShipmentRecord detail={detail} base={base} />;
  }

  if (resolved(type)) {
    const detail = await getEntityDetail(type as EntityKind, selected);
    if (!detail) return <Nothing>Nothing is stored about that one.</Nothing>;
    return <ThingRecord detail={detail} type={type as EntityKind} base={base} />;
  }

  const [record, graph] = await Promise.all([
    getObjectRecord("email", selected, runId),
    tab === "links" ? getObjectGraph(selected, runId, hops) : Promise.resolve(null),
  ]);
  if (!record) return <Nothing>No run has processed that email.</Nothing>;
  if (tab === "links") return <LinksTab runId={runId} graph={graph} record={record} />;
  return <RecordTab record={record} />;
}

async function things({ type, selected, emails, base }: Omit<BodyProps, "tab" | "hops" | "runId">) {
  if (type === "email") {
    return (
      <OntologyEmailList
        emails={emails}
        openId={selected}
        hrefFor={(emailId) => `${base}&id=${encodeURIComponent(emailId)}&tab=record`}
      />
    );
  }
  if (type === "shipment") {
    const { shipments } = await listShipments();
    return (
      <ShipmentList
        shipments={shipments}
        openId={selected}
        hrefFor={(id) => `${base}&id=${encodeURIComponent(id)}&tab=record`}
      />
    );
  }
  if (!resolved(type)) return <Nothing>This type is read through the database page, not as a list of things.</Nothing>;

  const [list, detail] = await Promise.all([
    listEntities(type as EntityKind),
    selected ? getEntityDetail(type as EntityKind, selected) : Promise.resolve(null),
  ]);
  return (
    <ThingList
      rows={list.entities}
      openId={selected}
      detail={detail}
      recordHrefFor={(entityId) => `${base}&id=${encodeURIComponent(entityId)}&tab=record`}
      hrefFor={(entityId) => (entityId ? `${base}&tab=things&id=${encodeURIComponent(entityId)}` : `${base}&tab=things`)}
    />
  );
}

function Nothing({ children }: { children: string }) {
  return (
    <div className="flex min-h-0 grow items-center justify-center bg-surface">
      <p className="max-w-[46ch] text-center text-strong text-ink-tertiary">{children}</p>
    </div>
  );
}
