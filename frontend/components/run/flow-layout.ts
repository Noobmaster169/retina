"use client";

import { sankey, sankeyJustify, sankeyLinkHorizontal } from "d3-sankey";
import { useMemo } from "react";

import type { FlowLink, FlowNode, RunFlow } from "./flow";

/**
 * Where every node and band of the flow sits.
 *
 * `d3-sankey` does the arithmetic that is genuinely hard: which column a node
 * belongs in, how the bands are ordered so they cross as little as possible,
 * and the path of each one. Split from the drawing because the dots follow the
 * very same paths, and because a layout is a calculation and a diagram is a
 * picture.
 *
 * `sankeyJustify` is what puts `No check needed` in the last column beside the
 * outcomes it belongs with rather than in the middle one it never entered: it
 * pushes every node with nothing leaving it to the right-hand edge.
 */

export const WIDTH = 760;
export const HEIGHT = 250;
export const NODE_WIDTH = 10;
/**
 * Far enough apart that two labels cannot touch. A label is one line of about
 * thirteen pixels centred on its node, and on a run where three outcomes hold
 * one email each the nodes are a pixel tall and sit as close as this lets
 * them: at sixteen, `Documents agree` and `Documents differ` overlapped.
 */
const NODE_PADDING = 24;
/**
 * Room for the labels, which sit outside the plot on every side: beside the
 * first and last columns, and above the middle one, whose own left is always
 * a band.
 */
export const PAD = { top: 22, right: 176, bottom: 22, left: 96 };

export type Laid = FlowNode & { x0: number; x1: number; y0: number; y1: number; last: boolean };
type LaidLink = { source: Laid; target: Laid; width: number; count: number; tone: FlowLink["tone"] };

export interface FlowLayout {
  /**
   * `last` says a node is in the right-hand column, and is worked out from the
   * node's own x rather than from `depth`.
   *
   * d3 owns `depth` on the objects it lays out and fills it with the distance
   * from the source, which is not where it put the node: `No check needed` is
   * one hop from `Arriving` and sits in the last column, so a label that
   * trusted `depth` was told 1, drew itself on the left, and landed on top of
   * the three-hundred-email band it was naming.
   */
  nodes: Laid[];
  links: (LaidLink & { id: string; d: string })[];
}

export function useFlowLayout(flow: RunFlow): FlowLayout {
  return useMemo(() => layoutFlow(flow), [flow]);
}

/**
 * The same layout without React, so a test can check what a reader will
 * actually see. Label collisions are geometry, not opinion: two of them within
 * a line of each other is a bug whatever it looks like on one person's screen.
 */
export function layoutFlow(flow: RunFlow): FlowLayout {
  {
    if (flow.links.length === 0) return { nodes: [], links: [] };
    const layout = sankey<FlowNode, { count: number; tone: FlowLink["tone"] }>()
      .nodeId((node) => node.id)
      .nodeWidth(NODE_WIDTH)
      .nodePadding(NODE_PADDING)
      .nodeAlign(sankeyJustify)
      // Our order, not the library's: see the note on FlowNode.order.
      .nodeSort((a, b) => a.order - b.order)
      .extent([
        [PAD.left, PAD.top],
        [WIDTH - PAD.right, HEIGHT - PAD.bottom],
      ]);

    const graph = layout({
      nodes: flow.nodes.map((node) => ({ ...node })),
      links: flow.links.map((link) => ({ source: link.from, target: link.to, value: link.count, count: link.count, tone: link.tone })),
    });

    const laid = graph.nodes as Omit<Laid, "last">[];
    const rightmost = Math.max(...laid.map((node) => node.x0));
    const path = sankeyLinkHorizontal();
    return {
      nodes: laid.map((node) => ({ ...node, last: node.x0 >= rightmost - 0.5 })),
      links: graph.links.map((link, at) => {
        const one = link as unknown as LaidLink;
        return { ...one, id: `flow-${at}`, d: path(link as never) ?? "" };
      }),
    };
  }
}

/** Where a node's label is drawn, which is what has to not collide. See `Label` in flow-diagram.tsx. */
export function labelSpot(node: Laid): { x: number; y: number; anchor: "start" | "middle" | "end" } {
  if (node.column === 1) return { x: (node.x0 + node.x1) / 2, y: node.y0 - 8, anchor: "middle" };
  if (node.last) return { x: node.x1 + 8, y: (node.y0 + node.y1) / 2, anchor: "start" };
  return { x: node.x0 - 8, y: (node.y0 + node.y1) / 2, anchor: "end" };
}
