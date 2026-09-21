"use client";

import { sankey, sankeyJustify, sankeyLinkHorizontal } from "d3-sankey";
import { useMemo } from "react";

import type { FlowLink, FlowNode, RunFlow } from "./flow";
import { SLICE_TONE } from "./outcome-tones";

/**
 * The run's journey, drawn.
 *
 * `d3-sankey` does the arithmetic that is genuinely hard, which is where each
 * node sits and how the bands are ordered so they cross as little as possible.
 * The painting is ours, because a charting library brings its own idea of what
 * a chart looks like and this one has to look like the rest of the product:
 * hairlines, the verdict hues already in `outcome-tones.ts`, and no shadow.
 *
 * `sankeyJustify` is what puts `No check needed` in the last column beside the
 * outcomes it belongs with rather than in the middle one it never entered: it
 * pushes every node with nothing leaving it to the right-hand edge.
 */

const WIDTH = 760;
const HEIGHT = 250;
const NODE_WIDTH = 10;
const NODE_PADDING = 16;
/** Room for the labels, which sit outside the plot on both sides. */
const PAD = { top: 6, right: 168, bottom: 6, left: 92 };

type Laid = FlowNode & { x0: number; x1: number; y0: number; y1: number };
type LaidLink = { source: Laid; target: Laid; width: number; count: number; tone: FlowLink["tone"] };

export interface FlowLayout {
  nodes: Laid[];
  links: (LaidLink & { id: string; d: string })[];
}

/** The layout alone, so the dots can follow the very same paths the bands are drawn from. */
export function useFlowLayout(flow: RunFlow): FlowLayout {
  return useMemo(() => {
    if (flow.links.length === 0) return { nodes: [], links: [] };
    const layout = sankey<FlowNode, { count: number; tone: FlowLink["tone"] }>()
      .nodeId((node) => node.id)
      .nodeWidth(NODE_WIDTH)
      .nodePadding(NODE_PADDING)
      .nodeAlign(sankeyJustify)
      .extent([
        [PAD.left, PAD.top],
        [WIDTH - PAD.right, HEIGHT - PAD.bottom],
      ]);

    const graph = layout({
      nodes: flow.nodes.map((node) => ({ ...node })),
      links: flow.links.map((link) => ({ source: link.from, target: link.to, value: link.count, count: link.count, tone: link.tone })),
    });

    const path = sankeyLinkHorizontal();
    return {
      nodes: graph.nodes as Laid[],
      links: graph.links.map((link, at) => {
        const laid = link as unknown as LaidLink;
        return { ...laid, id: `flow-${at}`, d: path(link as never) ?? "" };
      }),
    };
  }, [flow]);
}

export function FlowDiagram({
  flow,
  lit,
  onLight,
  children,
}: {
  flow: RunFlow;
  /** The node the reader is pointing at, or null. Everything else fades rather than moves. */
  lit: string | null;
  onLight(id: string | null): void;
  /** The dots, where a run is live enough to have any. */
  children?: React.ReactNode;
}) {
  const { nodes, links } = useFlowLayout(flow);
  if (links.length === 0) {
    return <p className="py-10 text-center text-body text-ink-tertiary">Nothing has landed yet.</p>;
  }

  const dim = (id: string, from: string) => (lit === null || lit === id || lit === from ? 1 : 0.18);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label="Where the run's emails went">
      <g>
        {links.map((link) => (
          <path
            key={link.id}
            id={link.id}
            d={link.d}
            fill="none"
            stroke={SLICE_TONE[link.tone].bar}
            strokeWidth={Math.max(1, link.width)}
            strokeOpacity={0.45 * dim(link.target.id, link.source.id)}
            className="transition-[stroke-opacity] duration-150"
          />
        ))}
      </g>

      {children}

      <g>
        {nodes.map((node) => (
          <g
            key={node.id}
            onMouseEnter={() => onLight(node.id)}
            onMouseLeave={() => onLight(null)}
            opacity={lit === null || lit === node.id ? 1 : 0.35}
            className="cursor-default transition-opacity duration-150"
          >
            <rect x={node.x0} y={node.y0} width={node.x1 - node.x0} height={Math.max(1, node.y1 - node.y0)} fill={SLICE_TONE[node.tone].bar} rx={2} />
            <Label node={node} />
            <title>{node.says ? `${node.label}: ${node.count}. ${node.says}` : `${node.label}: ${node.count}`}</title>
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * The name outside the band and the number under it. Left of the first column
 * and right of the last, never on top of a band: a label inside a band that is
 * two pixels tall is a label nobody can read.
 */
function Label({ node }: { node: Laid }) {
  const last = node.depth === 2;
  const x = last ? node.x1 + 8 : node.x0 - 8;
  const y = (node.y0 + node.y1) / 2;
  return (
    <text x={x} y={y} textAnchor={last ? "start" : "end"} dominantBaseline="middle" className="pointer-events-none">
      <tspan className={`text-[11px] ${SLICE_TONE[node.tone].key}`} fill="currentColor">
        {node.label}
      </tspan>
      <tspan x={x} dy="13" className="fill-ink font-mono text-[11px] tabular-nums">
        {node.count}
      </tspan>
    </text>
  );
}
