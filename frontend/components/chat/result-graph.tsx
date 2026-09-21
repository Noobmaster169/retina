"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import type { ChatGraph } from "@/lib/api/chat-agent-schemas";
import { layoutGraph } from "@/lib/graph/layout";

import { GraphDrawing } from "./graph-drawing";

/**
 * What the agent touched, drawn beside what it said.
 *
 * The screen that answers "how do I know it did not make that up". Every node
 * here was reported by a tool, never inferred from the answer, and a relation
 * that returned nothing still appears carrying its 0: the difference between
 * "there were none" and "it did not look" is the whole value of the panel.
 *
 * Inline SVG and absolute nodes rather than React Flow, because this one does
 * not pan or zoom. It is 240px tall in the panel and settles once; clicking it
 * opens the same drawing at full size in a modal, which is where a dense
 * graph gets read. It shares the layout function with the Links canvas, so the
 * two agree about what layered left to right means.
 */

/** The design's height. The graph is scaled to fit it rather than scrolled inside it. */
const PANEL_HEIGHT = 240;

export function ResultGraph({ graph }: { graph: ChatGraph }) {
  const [wide, setWide] = useState(false);
  if (graph.nodes.length <= 1) return null;

  const layout = layoutGraph({
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      focal: node.kind === "question",
    })),
    edges: graph.edges,
  });

  // Scaled down to fit, never up: a four node answer should not be drawn at
  // twice the size of an eleven node one just because it has the room.
  const scale = Math.min(1, (PANEL_HEIGHT - 16) / layout.height);
  const note = `${graph.nodes.length} nodes, drawn from what the tools reported`;

  return (
    <>
      <figure className="m-0 overflow-hidden rounded-xl border border-hairline bg-surface">
        <figcaption className="flex h-11 items-center gap-2 border-b border-hairline px-4">
          <span className="text-caption font-medium text-ink-tertiary">What it touched</span>
          <span className="min-w-0 truncate text-caption text-ink-faint">{note}</span>
          <span className="grow" />
          <button
            type="button"
            onClick={() => setWide(true)}
            className="flex h-7 items-center gap-1.5 rounded-sm px-2 text-caption text-ink-secondary hover:bg-active"
          >
            <Icon name="expand" size={12} />
            Expand
          </button>
        </figcaption>

        {/*
          A transform does not change the space an element takes, so the scaled
          drawing sits inside a box of its scaled size. Without that the panel
          keeps a scrollbar for height the graph no longer uses.
        */}
        <button
          type="button"
          onClick={() => setWide(true)}
          aria-label="Expand the graph"
          className="block w-full cursor-zoom-in overflow-x-auto overflow-y-hidden text-left"
          style={{ height: PANEL_HEIGHT }}
        >
          <div className="relative" style={{ width: layout.width * scale, height: layout.height * scale }}>
            <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
              <GraphDrawing graph={graph} layout={layout} />
            </div>
          </div>
        </button>
      </figure>

      <Modal open={wide} onOpenChange={setWide} title="What it touched" note={note}>
        <div className="p-6">
          <GraphDrawing graph={graph} layout={layout} />
        </div>
      </Modal>
    </>
  );
}
