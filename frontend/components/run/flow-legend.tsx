"use client";

import Link from "next/link";

import type { FlowNode } from "./flow";
import { SLICE_TONE } from "./outcome-tones";

/**
 * What each colour in the flow means, and the way into the emails behind it.
 *
 * Built from the diagram's own end nodes rather than from a second list, so a
 * swatch here and a band there cannot come to disagree about either the colour
 * or the count. Hovering one lights its band; clicking one opens exactly the
 * emails it counted.
 *
 * It reads as a legend and works as a set of links, which is the pair the
 * picture cannot give on its own: a band is hard to point at and impossible to
 * tab to, and nothing on an SVG says which grey is which.
 */

interface FlowLegendProps {
  /** The endings, in the order the diagram stacks them. */
  endings: FlowNode[];
  /** The four reasons inside `Needs a person`, which are one band up there. */
  reasons: FlowNode[];
  runId: string;
  lit: string | null;
  onLight(id: string | null): void;
}

export function FlowLegend({ endings, reasons, runId, lit, onLight }: FlowLegendProps) {
  return (
    <div className="space-y-1.5 border-t border-hairline-faint pt-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {endings.map((node) => (
          <Item key={node.id} node={node} runId={runId} lit={lit} onLight={onLight} strong />
        ))}
      </div>

      {reasons.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* One mark for the group: all four are the same outcome read four ways. */}
          <span className="flex items-center gap-1.5 text-caption text-ink-tertiary">
            <Swatch tone="review" />
            of which
          </span>
          {reasons.map((node) => (
            <Item key={node.id} node={node} runId={runId} lit={lit} onLight={onLight} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Item({
  node,
  runId,
  lit,
  onLight,
  strong = false,
}: {
  node: FlowNode;
  runId: string;
  lit: string | null;
  onLight(id: string | null): void;
  /** An ending carries its swatch; a reason inside one does not, because the group already showed it. */
  strong?: boolean;
}) {
  // A reason lights the band it is part of, because that is the band it is in.
  const lights = strong ? node.id : "needs-person";
  const faded = lit !== null && lit !== lights;
  const body = (
    <>
      {strong ? <Swatch tone={node.tone} /> : null}
      <span className={strong ? "text-ink-secondary" : "text-ink-tertiary"}>{node.label}</span>
      <span className="font-mono text-mono-sm tabular-nums text-ink">{node.count}</span>
    </>
  );
  const shell = `flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-caption transition-opacity duration-150 ${
    faded ? "opacity-35" : "opacity-100"
  }`;

  if (node.filter === null) return <span className={shell}>{body}</span>;
  return (
    <Link
      href={`/runs/${runId}/inbox?filter=${node.filter}`}
      title={node.says}
      onMouseEnter={() => onLight(lights)}
      onMouseLeave={() => onLight(null)}
      onFocus={() => onLight(lights)}
      onBlur={() => onLight(null)}
      className={`${shell} hover:bg-active`}
    >
      {body}
    </Link>
  );
}

function Swatch({ tone }: { tone: FlowNode["tone"] }) {
  return <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: SLICE_TONE[tone].bar }} />;
}
