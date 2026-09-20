"use client";

import { Handle, type NodeProps, Position } from "@xyflow/react";

import { Icon } from "@/components/ui/icons";
import type { GraphNode } from "@/lib/api/ontology-schemas";

import { GLYPH_OF, isMono, LABEL_OF } from "./glyphs";

/**
 * One node of the Links canvas: a tinted glyph, the thing's name, and one line
 * saying what it is.
 *
 * A real `<a>`, not a div with a click handler. A canvas is not a reason to
 * drop out of the document: every node here is reachable by Tab, carries its
 * own href, and reads correctly to a screen reader, which is what
 * docs/05-design.md section 10 asks of every surface and what a canvas
 * renderer would have taken away.
 */

export interface ObjectNodeData extends Record<string, unknown> {
  node: GraphNode;
  href: string | null;
  width: number;
}

const TINT: Record<GraphNode["tone"], string> = {
  neutral: "bg-active text-ink-tertiary",
  differ: "bg-differ-tint text-differ",
  review: "bg-review-tint text-review",
  match: "bg-match-tint text-match",
};

const BORDER: Record<GraphNode["tone"], string> = {
  neutral: "border-hairline",
  differ: "border-differ-line",
  review: "border-review-line",
  match: "border-hairline",
};

export function ObjectNode({ data }: NodeProps & { data: ObjectNodeData }) {
  const { node, href, width } = data;
  const focal = node.focal;

  const shell = [
    "block box-border rounded-xl bg-canvas no-underline",
    focal ? "border-2 border-ink px-3.5 py-3 shadow-overlay" : `border ${BORDER[node.tone]} px-3 py-2.5`,
    href ? "hover:border-hairline-strong" : "cursor-default",
  ].join(" ");

  const name = [
    "block min-w-0 truncate",
    focal ? "font-mono text-[14px] font-medium" : isMono(node.type) ? "font-mono text-mono-sm text-ink" : "text-strong text-ink",
  ].join(" ");

  const Shell = href ? "a" : "div";

  return (
    <>
      {/* Edges enter and leave horizontally, so a layered graph reads across. */}
      <Handle type="target" position={Position.Left} className="!h-0 !w-0 !border-0 !bg-transparent" isConnectable={false} />
      <Shell {...(href ? { href } : {})} className={shell} style={{ width }} title={`${LABEL_OF[node.type]}: ${node.label}`}>
        <span className="flex items-center gap-2">
          <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-xs ${TINT[node.tone]}`}>
            <Icon name={GLYPH_OF[node.type]} size={10} />
          </span>
          <span className={name}>{node.label}</span>
        </span>
        <span className={`mt-[3px] ml-[26px] block truncate text-caption ${node.tone === "differ" ? "text-differ" : "text-ink-faint"}`}>
          {node.sub}
        </span>
      </Shell>
      <Handle type="source" position={Position.Right} className="!h-0 !w-0 !border-0 !bg-transparent" isConnectable={false} />
    </>
  );
}
