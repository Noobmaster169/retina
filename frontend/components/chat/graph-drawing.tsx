import type { ChatGraph } from "@/lib/api/chat-agent-schemas";
import type { layoutGraph } from "@/lib/graph/layout";

/**
 * The nodes and edges of a result graph at natural size. The panel scales
 * it down to fit; the modal shows it as it is. One drawing, two frames.
 */
export function GraphDrawing({ graph, layout }: { graph: ChatGraph; layout: ReturnType<typeof layoutGraph> }) {
  const placed = new Map(layout.nodes.map((node) => [node.id, node]));
  return (
    <div className="relative" style={{ width: layout.width, height: layout.height }}>
<svg
  width={layout.width}
  height={layout.height}
  className="absolute inset-0"
  aria-hidden="true"
>
  {graph.edges.map((edge, index) => {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    if (!from || !to) return null;
    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const bend = Math.max((x2 - x1) / 2, 12);
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
      style={{
        left: at.x,
        top: at.y,
        width: at.width,
        height: at.height,
      }}
      className={`absolute box-border rounded-sm border bg-canvas px-2 py-2 ${
        node.kind === "question"
          ? "border-ink"
          : node.empty
            ? "border-dashed border-hairline-strong"
            : "border-hairline"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`min-w-0 truncate font-mono text-mono-xs ${
            node.empty
              ? "text-ink-faint"
              : node.kind === "question"
                ? "font-medium text-ink"
                : "text-ink-secondary"
          }`}
        >
          {node.label}
        </span>
        {node.count !== null ? (
          <>
            <span className="grow" />
            <span
              className={`shrink-0 border-l border-hairline pl-1.5 font-mono text-mono-xs ${
                node.empty ? "text-ink-faint" : "text-ink"
              }`}
            >
              {node.count}
            </span>
          </>
        ) : null}
      </div>
      <div className="mt-0.5 text-[10px] text-ink-faint">
        {node.kind}
      </div>
    </div>
  );
})}
    </div>
  );
}
