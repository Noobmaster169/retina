import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { type OntologyTab, OntologyTabs } from "@/components/ontology/tabs";
import { tabBody } from "@/components/ontology/tab-body";
import { TypeRail } from "@/components/ontology/type-rail";
import { TopBar } from "@/components/shell/top-bar";
import { listObjectTypes, listRunEmails } from "@/lib/api-client";
import type { ObjectTypeSummary } from "@/lib/api/ontology-schemas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ontology · Retina SDOC" };

const RUN_ID = /^[0-9a-f-]{36}$/;

function one(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Which email the page opens on.
 *
 * The one with the most differing fields, because a record with two
 * differences and eight links says what this page is for, and an email that
 * was sorted SPAM and stopped says almost nothing.
 */
function opening(emails: { emailId: string; defectFields: string[] }[]): string | null {
  return [...emails].sort((a, b) => b.defectFields.length - a.defectFields.length)[0]?.emailId ?? null;
}

/**
 * The model as a model: the things it knows, one of them, and what links out
 * of it.
 *
 * Type, selection and tab are all in the URL, so every view is shareable, back
 * works and a reload lands where you were. That is why this is one server
 * component: the only client code left on the page is the canvas, which needs
 * to be.
 */
export default async function Page({ params, searchParams }: PageProps<"/runs/[id]/ontology">) {
  const { id } = await params;
  if (!RUN_ID.test(id)) notFound();
  const asked = await searchParams;

  const types = await listObjectTypes();
  const wanted = one(asked.type);
  const type = types.some((entry) => entry.type === wanted && entry.built) ? (wanted as string) : "email";
  const descriptor = types.find((entry) => entry.type === type) as ObjectTypeSummary;

  const base = `/runs/${id}/ontology?type=${type}`;

  // An email is picked for you, because landing on a record says what this page
  // is far better than landing on a list. A resolved thing is not: there is no
  // "most interesting" port, and opening one at random would look like a
  // selection somebody made.
  const emails = type === "email" ? (await listRunEmails(id, { pageSize: 200 })).emails : [];
  const selected = one(asked.id) ?? (type === "email" ? opening(emails) : null);
  const tab = tabFor(one(asked.tab), selected);
  const hops = one(asked.hops) === "2" ? 2 : 1;

  const hrefs: Record<OntologyTab, string | null> = {
    things: `${base}&tab=things${selected ? `&id=${encodeURIComponent(selected)}` : ""}`,
    record: selected ? `${base}&id=${encodeURIComponent(selected)}&tab=record` : null,
    // Only an email has a graph today. A dead tab on a port would be a promise
    // the page does not keep.
    links: selected && type === "email" ? `${base}&id=${encodeURIComponent(selected)}&tab=links` : null,
  };

  return (
    <>
      {/*
        The canvas takes the width this rail would have had. GraphLinks.dc.html
        is one rail and 868px of canvas; squeezing a second rail in beside it
        clipped both end columns off the graph. The product's own rail stays,
        which is the rule docs/05-design.md section 7 actually states; this one
        is an index, and the tabs above already say where you are.
      */}
      {tab === "links" ? null : (
        <TypeRail
          types={types}
          active={type}
          heading="What Retina knows"
          hrefFor={(entry) => (entry.built ? `/runs/${id}/ontology?type=${entry.type}&tab=things` : null)}
        />
      )}

      <div className="flex min-w-0 grow flex-col">
        <TopBar
          crumbs={[
            { label: "Ontology" },
            { label: descriptor.label, href: `${base}&tab=things` },
            ...(selected && tab !== "things" ? [{ label: selected, mono: type === "email" }] : []),
          ]}
        >
          {tab === "links" && selected ? (
            <Link
              href={`${hrefs.links as string}${hops === 2 ? "" : "&hops=2"}`}
              aria-pressed={hops === 2}
              className={`flex h-8 items-center rounded-md border px-3 text-strong ${
                hops === 2 ? "border-ink bg-active font-medium text-ink" : "border-hairline-strong text-ink-secondary hover:border-ink-faint"
              }`}
            >
              Two hops
            </Link>
          ) : null}
        </TopBar>
        <OntologyTabs active={tab} hrefs={hrefs} />
        {await tabBody({ runId: id, type, selected, tab, emails, base, hops })}
      </div>
    </>
  );
}

/** The record tab needs something selected; without one the list is the only honest landing. */
function tabFor(asked: string | null, selected: string | null): OntologyTab {
  if (asked === "record" || asked === "links") return selected ? asked : "things";
  if (asked === "things") return "things";
  return selected ? "record" : "things";
}
