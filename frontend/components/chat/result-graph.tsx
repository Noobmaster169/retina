import type { ChatGraph, ChatGraphNode } from "@/lib/api/chat-agent-schemas";
import { layoutGraph } from "@/lib/graph/layout";

/**
 * What the agent touched, drawn beside what it said.
 *
 * The screen that answers "how do I know it did not make that up". Every node
 * here was reported by a tool, never inferred from the answer, and a relation
 * that returned nothing still appears carrying its 0: the difference between
 * "there were none" and "it did not look" is the whole value of the panel.
 *
 * Inline SVG and absolute nodes rather than React Flow, because this one does
 * not pan or zoom. It is 240px tall, it settles once, and a canvas runtime for
 * a picture nobody interacts with would be weight for nothing. It shares the
 * layout function with the Links canvas, so the two agree about what layered
 * left to right means.
 */

const WIDTH_OF: Record<ChatGraphNode["kind"], number> = {
  question: 188,
  tool: 140,
  relation: 208,
  entity: 176,
};

export function ResultGraph({ graph }: { graph: ChatGraph }) {
  if (graph.nodes.length <= 1) return null;

  const layout = layoutGraph({
    nodes: graph.nodes.map((node) => ({ id: node.id, focal: node.kind === "question" })),
    edges: graph.edges,
  });
  const placed = new Map(layout.nodes.map((node) => [node.id, node]));
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));

  return (
    <figure className="m-0 overflow-hidden rounded-xl border border-hairline bg-surface">
      <figcaption className="flex h-11 items-center gap-2 border-b border-hairline px-4">
        <span className="text-caption font-medium text-ink-tertiary">What it touched</span>
        <span className="grow" />
        <span className="text-caption text-ink-faint">
          {graph.nodes.length} nodes, drawn from what the tools reported
        </span>
      </figcaption>

      <div className="h-[240px] overflow-auto">
        <div className="relative" style={{ width: layout.width, height: Math.max(layout.height, 200) }}>
          <svg width={layout.width} height={Math.max(layout.height, 200)} className="absolute inset-0" aria-hidden="true">
            {graph.edges.map((edge, index) => {
              const from = placed.get(edge.from);
              const to = placed.get(edge.to);
              if (!from || !to) return null;
              const x1 = from.x + WIDTH_OF[byId.get(edge.from)?.kind ?? "tool"];
              const y1 = from.y + from.height / 2;
              const x2 = to.x;
              const y2 = to.y + to.height / 2;
              const bend = (x2 - x1) / 2;
              return (
                <path
                  key={`${edge.from}-${edge.to}-${index}`}
                  d={`M${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="var(--hairline-strong)"
                  strokeWidth={1}
                />
              );
            })}
          </svg>

          {graph.nodes.map((node) => {
            const at = placed.get(node.id);
            if (!at) return null;
            return (
              <div
                key={node.id}
                style={{ left: at.x, top: at.y, width: WIDTH_OF[node.kind] }}
                className={`absolute box-border rounded-sm border bg-canvas px-2 py-2 ${
                  node.kind === "question" ? "border-ink" : node.empty ? "border-dashed border-hairline-strong" : "border-hairline"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`min-w-0 truncate font-mono text-mono-xs ${
                      node.empty ? "text-ink-faint" : node.kind === "question" ? "font-medium text-ink" : "text-ink-secondary"
                    }`}
                  >
                    {node.label}
                  </span>
                  {node.count !== null ? (
                    <>
                      <span className="grow" />
                      <span
                        className={`shrink-0 border-l pl-1.5 font-mono text-mono-xs ${
                          node.empty ? "border-hairline text-ink-faint" : "border-hairline text-ink"
                        }`}
                      >
                        {node.count}
                      </span>
                    </>
                  ) : null}
                </div>
                <div className="mt-0.5 text-[10px] text-ink-faint">{node.kind}</div>
              </div>
            );
          })}
        </div>
      </div>
    </figure>
  );
}
