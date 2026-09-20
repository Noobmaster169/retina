"use client";

import {
  Background,
  BackgroundVariant,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useMemo } from "react";

import type { ObjectGraph } from "@/lib/api/ontology-schemas";
import { layoutGraph } from "@/lib/graph/layout";

import { NamedEdge, type NamedEdgeData } from "./named-edge";
import { ObjectNode, type ObjectNodeData } from "./object-node";

/**
 * The Links canvas: one record, one hop out, laid out once and frozen.
 *
 * React Flow draws and pans; it does no layout of its own, so the positions
 * come from `lib/graph/layout.ts`, which is pure and tested. Dragging and
 * connecting are off: a frozen graph is the design's whole argument, and a
 * node a reader can shove across the canvas is a graph that drifts while they
 * read it.
 */

const NODE_TYPES = { object: ObjectNode };
const EDGE_TYPES = { named: NamedEdge };

/** The clamp docs/design/ontology-patterns.md section 3.4 sets. Past it, either nothing or everything is legible. */
const ZOOM = { min: 0.5, max: 2 };

/**
 * How the canvas opens.
 *
 * `minZoom` here is not the clamp above: it is the floor on the opening fit,
 * so a graph too wide for the pane opens at a size the labels can be read at
 * and is panned, rather than opening as a legible diagram of nothing. That is
 * also why `Fit` is a button and not a promise the page keeps by itself.
 */
const FIT = { padding: 0.08, minZoom: 0.75, maxZoom: 1.1 };

interface ObjectCanvasProps {
  graph: ObjectGraph;
  runId: string;
  /** Which node the inspector is showing, drawn with the focus ring on the canvas. */
  selectedId: string | null;
  onSelect(id: string): void;
  /**
   * Bumped by the header's `Fit`. A number rather than a ref because the
   * control lives in the top bar and the viewport lives inside the provider,
   * and a counter crosses that boundary without either side holding the other.
   */
  fitSignal: number;
}

/** Where a node leads. Only the things with a page of their own get one. */
function hrefFor(node: ObjectGraph["nodes"][number], runId: string): string | null {
  if (node.type === "email") return `/runs/${runId}/emails/${node.label}`;
  if (node.type === "client") return "/clients";
  if (node.type === "port" || node.type === "party") return `/runs/${runId}/database?type=${node.type}&id=${node.id.split(":")[1]}`;
  return null;
}

function Canvas({ graph, runId, selectedId, onSelect, fitSignal }: ObjectCanvasProps) {
  const { fitView } = useReactFlow();

  const { nodes, edges } = useMemo(() => {
    const layout = layoutGraph({
      nodes: graph.nodes.map((node) => ({ id: node.id, focal: node.focal })),
      edges: graph.edges,
    });
    const placed = new Map(layout.nodes.map((node) => [node.id, node]));

    const flowNodes: Node<ObjectNodeData>[] = graph.nodes.map((node) => {
      const at = placed.get(node.id);
      return {
        id: node.id,
        type: "object",
        position: { x: at?.x ?? 0, y: at?.y ?? 0 },
        data: { node, href: hrefFor(node, runId), width: at?.width ?? 196 },
        selected: node.id === selectedId,
        draggable: false,
        connectable: false,
      };
    });

    const flowEdges: Edge<NamedEdgeData>[] = graph.edges.map((edge, index) => ({
      id: `${edge.from}->${edge.to}-${index}`,
      source: edge.from,
      target: edge.to,
      type: "named",
      data: { label: edge.label, tone: edge.tone },
    }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [graph, runId, selectedId]);

  // Refit when the graph itself changes, which is what `Two hops` does, and
  // when someone asks. Not on selection: moving the viewport because a person
  // clicked a node is the drift this page promises not to have.
  useEffect(() => {
    fitView(FIT);
  }, [fitView, graph, fitSignal]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodeClick={(_event, node) => onSelect(node.id)}
      fitView
      fitViewOptions={FIT}
      minZoom={ZOOM.min}
      maxZoom={ZOOM.max}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      panOnScroll
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: false }}
      className="bg-surface"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--hairline)" />
    </ReactFlow>
  );
}

/**
 * `useReactFlow` has to be called inside the provider, and `<ReactFlow>`'s own
 * one only covers its children. So the provider is here and the hook is one
 * component down, which is the arrangement that lets `Fit` work at all.
 */
export function ObjectCanvas(props: ObjectCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
