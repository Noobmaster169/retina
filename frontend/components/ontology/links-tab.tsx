"use client";

import { useState } from "react";

import { ObjectCanvas } from "@/components/graph/object-canvas";
import type { ObjectGraph, ObjectRecord } from "@/lib/api/ontology-schemas";

import { GraphInspector } from "./graph-inspector";

/**
 * The Links tab: the canvas, and whichever node the reader is on.
 *
 * It owns its own selection and its own `Fit`, because neither belongs in the
 * URL: which node you last clicked is not a place, and asking the server to
 * re-render a frozen canvas to move a focus ring would be the drift this page
 * promises not to have.
 *
 * The inspector is only filled for the focal node. Every other node is a thing
 * whose own record this page has not loaded, and an empty `What it holds`
 * under its name would read as "nothing is stored about this", which is a
 * claim rather than a gap.
 */

export function LinksTab({
  runId,
  graph,
  record,
}: {
  runId: string;
  graph: ObjectGraph | null;
  record: ObjectRecord;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex min-h-0 grow items-center justify-center bg-surface">
        <p className="max-w-[46ch] text-center text-strong text-ink-tertiary">
          Nothing links to this record yet. Links appear once the email has been read and compared.
        </p>
      </div>
    );
  }

  const selected = graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes.find((node) => node.focal) ?? null;

  return (
    <div className="flex min-h-0 grow">
      <div className="relative min-w-0 grow">
        <button
          type="button"
          onClick={() => setFitSignal((was) => was + 1)}
          className="absolute top-3 right-3 z-10 flex h-8 items-center rounded-md border border-hairline-strong bg-canvas px-3 text-strong text-ink-secondary hover:border-ink-faint"
        >
          Fit
        </button>
        <ObjectCanvas
          graph={graph}
          runId={runId}
          selectedId={selectedId}
          onSelect={setSelectedId}
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
