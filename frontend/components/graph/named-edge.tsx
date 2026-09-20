"use client";

import { BaseEdge, type EdgeProps, EdgeLabelRenderer, getBezierPath, getSmoothStepPath } from "@xyflow/react";

/**
 * An edge with its relation drawn on it.
 *
 * The name is the point. `sent it` is the sender domain, `carries` is the
 * attachment, `judged into` is the comparison the documents rolled up to: a
 * reader who follows an edge learns which column of which table it was, which
 * is the difference between a diagram and a picture of a diagram.
 *
 * A difference takes right angles and amber. Curves read as flow and a
 * difference is not a flow, it is a finding, and it is the one thing on this
 * canvas that means something went wrong.
 */

export interface NamedEdgeData extends Record<string, unknown> {
  label: string;
  tone: "neutral" | "differ";
}

export function NamedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps & { data?: NamedEdgeData }) {
  const differ = data?.tone === "differ";
  const geometry = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };
  const [path, labelX, labelY] = differ
    ? getSmoothStepPath({ ...geometry, borderRadius: 4 })
    : getBezierPath(geometry);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: differ ? "var(--verdict-differ)" : "var(--hairline-strong)", strokeWidth: 1.25 }}
      />
      {data?.label ? (
        <EdgeLabelRenderer>
          <div
            // Over the line and off the nodes, on the surface colour, so the
            // name reads without a box drawn around it.
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className={`pointer-events-none absolute rounded-xs bg-surface px-1 text-micro ${
              differ ? "text-differ" : "text-ink-tertiary"
            }`}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
