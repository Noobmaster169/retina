"use client";

import { ObjectCanvas } from "@/components/graph/object-canvas";
import type { ObjectGraph, ObjectRecord } from "@/lib/api/ontology-schemas";

import { GraphInspector } from "./graph-inspector";

/**
 * The Links tab: the canvas, and whichever node the reader is on.
 *
 * The inspector is only filled for the focal node. Every other node on the
 * canvas is a thing whose own record this page has not loaded, and showing an
 * empty `What it holds` under its name would read as "nothing is stored about
 * this", which is a claim rather than a gap.
 */
export function LinksTab({
  runId,
  graph,
  record,
  selected,
  selectedId,
  onSelect,
  fitSignal,
}: {
  runId: string;
  graph: ObjectGraph | null;
  record: ObjectRecord;
  /** What the inspector shows, which is the focal node until someone picks another. */
  selected: ObjectGraph["nodes"][number] | null;
  /**
   * What a person actually chose, which is nothing to begin with. The focus
   * ring is drawn from this and not from `selected`, so it means "you picked
   * this" rather than sitting on the focal node from the moment the tab opens.
   */
  selectedId: string | null;
  onSelect(id: string): void;
  fitSignal: number;
}) {
  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex min-h-0 grow items-center justify-center bg-surface">
        <p className="max-w-[46ch] text-center text-strong text-ink-tertiary">
          Nothing links to this record yet. Links appear once the email has been read and compared.
        </p>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 grow">
      <div className="min-w-0 grow">
        <ObjectCanvas
          graph={graph}
          runId={runId}
          selectedId={selectedId}
          onSelect={onSelect}
          fitSignal={fitSignal}
        />
      </div>
      {selected ? (
        <div className="hidden w-[340px] shrink-0 xl:flex">
          <GraphInspector
            node={selected}
            blurb={selected.focal ? record.blurb : selected.sub}
            values={selected.focal ? record.values : []}
            links={selected.focal ? record.links : []}
            openHref={selected.focal ? record.openHref : null}
            openLabel="Open the email"
          />
        </div>
      ) : null}
    </div>
  );
}
