"use client";

import { useRouter } from "next/navigation";

import type { RunFlow } from "./flow";
import { type FlowLayout, type Laid, HEIGHT, NODE_WIDTH, useFlowLayout, WIDTH } from "./flow-layout";
import { SLICE_TONE } from "./outcome-tones";

/**
 * The run's journey, drawn.
 *
 * The layout is `flow-layout.ts`; this is the painting, and it is ours because
 * a charting library brings its own idea of what a chart looks like and this
 * one has to look like the rest of the product: hairlines, the verdict hues
 * already in `outcome-tones.ts`, and no shadow.
 */

/** How far a label reaches, and so how wide the thing a mouse can find is. */
const LABEL_REACH = 150;

export type { FlowLayout };

export function FlowDiagram({
  flow,
  runId,
  lit,
  onLight,
  children,
}: {
  flow: RunFlow;
  /** Whose inbox a node opens. */
  runId: string;
  /** The node the reader is pointing at, or null. Everything else fades rather than moves. */
  lit: string | null;
  onLight(id: string | null): void;
  /** The dots, where a run is live enough to have any. */
  children?: React.ReactNode;
}) {
  const { nodes, links } = useFlowLayout(flow);
  const router = useRouter();
  if (links.length === 0) {
    return <p className="py-10 text-center text-body text-ink-tertiary">Nothing has landed yet.</p>;
  }

  const on = (id: string) => lit === null || lit === id;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label="Where the run's emails went">
      <defs>
        {/*
          Each band runs from the colour of where it starts to the colour of
          where it ends, which is what makes it read as a journey rather than
          as a shape. One flat colour left the two neutrals, the three hundred
          needing no check and the ninety-one with no draft, as two grey shapes
          a reader had to trace back to the fork to tell apart.
        */}
        {links.map((link) => (
          <linearGradient key={link.id} id={`${link.id}-paint`} gradientUnits="userSpaceOnUse" x1={link.source.x1} x2={link.target.x0}>
            <stop offset="0%" stopColor={SLICE_TONE[link.source.tone].bar} />
            <stop offset="100%" stopColor={SLICE_TONE[link.tone].bar} />
          </linearGradient>
        ))}
      </defs>

      <g>
        {links.map((link) => (
          <path
            key={link.id}
            id={link.id}
            d={link.d}
            fill="none"
            stroke={`url(#${link.id}-paint)`}
            strokeWidth={Math.max(1, link.width)}
            strokeOpacity={on(link.target.id) || on(link.source.id) ? 0.5 : 0.12}
            // Pointing at a band is pointing at where it goes, which is the
            // question a band raises. Without this only the ten-pixel node
            // bars could be hit, and almost nothing on the diagram lit up.
            onMouseEnter={() => onLight(link.target.id)}
            onMouseLeave={() => onLight(null)}
            className="cursor-pointer transition-[stroke-opacity] duration-150"
          />
        ))}
      </g>

      {children}

      <g>
        {nodes.map((node) => {
          // Opens the emails this band ended in. The same pattern the business
          // tables use for a clickable row: a click, and Enter when it has
          // focus, rather than an anchor the SVG cannot hold.
          const open = node.filter === null ? undefined : () => router.push(`/runs/${runId}/inbox?filter=${node.filter}`);
          return (
          <g
            key={node.id}
            onMouseEnter={() => onLight(node.id)}
            onMouseLeave={() => onLight(null)}
            onClick={open}
            onKeyDown={(event) => {
              if (open && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                open();
              }
            }}
            role={open ? "link" : undefined}
            tabIndex={open ? 0 : undefined}
            aria-label={open ? `${node.label}: ${node.count}. Open these emails.` : undefined}
            opacity={on(node.id) ? 1 : 0.3}
            className={`transition-opacity duration-150 focus:outline-none focus-visible:opacity-100 ${open ? "cursor-pointer" : "cursor-default"}`}
          >
            {/*
              The thing a mouse actually finds. The bar is ten pixels wide and
              the words beside it were unreachable, so a node, its name and its
              number are one target.
            */}
            <rect
              x={node.last ? node.x0 - 4 : node.x0 - LABEL_REACH}
              y={node.y0 - 10}
              width={LABEL_REACH + NODE_WIDTH + 4}
              height={Math.max(1, node.y1 - node.y0) + 20}
              fill="transparent"
            />
            <rect x={node.x0} y={node.y0} width={node.x1 - node.x0} height={Math.max(1, node.y1 - node.y0)} fill={SLICE_TONE[node.tone].bar} rx={2} />
            <Label node={node} />
            <title>{node.says ? `${node.label}: ${node.count}. ${node.says}` : `${node.label}: ${node.count}`}</title>
          </g>
          );
        })}
      </g>
    </svg>
  );
}

/**
 * A node's name and its count, on one line, never on top of a band.
 *
 * Three placements, because a Sankey has three kinds of column. The first has
 * open space to its left and the last to its right. The middle one has a band
 * on both sides by definition, so its label goes above it; put to the left it
 * sat on the very band feeding it, which is what `Needs a check 12` was doing
 * across the band carrying the twelve.
 *
 * One line and not two. Stacking the count under the name doubled a label's
 * height, and on a run where three outcomes hold one email each the nodes are
 * a pixel tall and stack closer than that: `Documents agree` and `Documents
 * differ` ran into each other.
 *
 * The canvas-coloured stroke under the glyphs is drawn first, so a label that
 * still ends up near a band is read against the page rather than through it.
 */
function Label({ node }: { node: Laid }) {
  const above = node.column === 1;
  const x = above ? (node.x0 + node.x1) / 2 : node.last ? node.x1 + 8 : node.x0 - 8;
  const y = above ? node.y0 - 8 : (node.y0 + node.y1) / 2;
  return (
    <text
      x={x}
      y={y}
      textAnchor={above ? "middle" : node.last ? "start" : "end"}
      dominantBaseline="middle"
      stroke="var(--canvas)"
      strokeWidth={3}
      paintOrder="stroke"
      className="pointer-events-none"
    >
      <tspan className={`text-[11px] ${SLICE_TONE[node.tone].key}`} fill="currentColor">
        {node.label}
      </tspan>
      <tspan dx="5" className="fill-ink font-mono text-[11px] tabular-nums">
        {node.count}
      </tspan>
    </text>
  );
}
