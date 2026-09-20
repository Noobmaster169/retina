/**
 * Where each node of a one-hop graph sits.
 *
 * Layered left to right and deterministic: what points at the focal goes on
 * its left, what it points at goes on its right, and each column is centred on
 * the canvas. It settles once and freezes, which is what both
 * `docs/design/ontology-patterns.md` section 3.2 and the Links canvas ask for:
 * "laid out once and frozen. Nothing on this canvas drifts while you read it."
 *
 * Pure, and separate from the renderer, because React Flow does no layout of
 * its own and because a layout with a table-driven test is one that can be
 * changed without opening a browser.
 */

export interface LayoutInput {
  nodes: { id: string; focal: boolean }[];
  edges: { from: string; to: string }[];
}

export interface PlacedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0 is the focal, negative is what points at it, positive is what it points at. */
  depth: number;
}

export interface Layout {
  nodes: PlacedNode[];
  width: number;
  height: number;
}

const NODE_HEIGHT = 58;
const ROW_GAP = 26;
const COLUMN_GAP = 64;
const PADDING = 28;

/**
 * Column widths, by distance from the focal.
 *
 * The canvas gives the focal and the documents beside it more room than the
 * context column, because a document's filename is the longest string on the
 * page and a client domain is the shortest. Anything further out takes the
 * default.
 */
const WIDTH_BY_DEPTH: Record<number, number> = { [-1]: 184, 0: 196, 1: 220, 2: 220, 3: 176 };
const DEFAULT_WIDTH = 196;

function widthAt(depth: number): number {
  return WIDTH_BY_DEPTH[depth] ?? DEFAULT_WIDTH;
}

/**
 * How far each node is from the focal, following edges in either direction.
 *
 * Repeated passes rather than one BFS because an edge may be discovered from
 * either end: a document is reached forwards from the email, and a client
 * backwards from it. The loop is bounded by the node count, so a graph with a
 * cycle terminates rather than spinning.
 */
function depths(input: LayoutInput, focalId: string): Map<string, number> {
  const depth = new Map<string, number>([[focalId, 0]]);
  for (let pass = 0; pass < input.nodes.length; pass++) {
    let moved = false;
    for (const edge of input.edges) {
      const from = depth.get(edge.from);
      const to = depth.get(edge.to);
      if (from !== undefined && to === undefined) {
        depth.set(edge.to, from + 1);
        moved = true;
      } else if (to !== undefined && from === undefined) {
        depth.set(edge.from, to - 1);
        moved = true;
      }
    }
    if (!moved) break;
  }
  // A node no edge reaches still belongs on the canvas: it is a thing that is
  // there and connected to nothing, which is worth seeing rather than hiding.
  for (const node of input.nodes) if (!depth.has(node.id)) depth.set(node.id, 1);
  return depth;
}

export function layoutGraph(input: LayoutInput): Layout {
  const focal = input.nodes.find((node) => node.focal) ?? input.nodes[0];
  if (!focal) return { nodes: [], width: PADDING * 2, height: PADDING * 2 };

  const depth = depths(input, focal.id);

  // Insertion order inside a column, because the backend already returns the
  // nodes in the order a reader should meet them and a second sort here would
  // be a second opinion about that.
  const columns = new Map<number, string[]>();
  for (const node of input.nodes) {
    const at = depth.get(node.id) as number;
    const held = columns.get(at);
    if (held) held.push(node.id);
    else columns.set(at, [node.id]);
  }

  const order = [...columns.keys()].sort((a, b) => a - b);
  const heights = order.map((at) => (columns.get(at) as string[]).length * NODE_HEIGHT + ((columns.get(at) as string[]).length - 1) * ROW_GAP);
  const tallest = Math.max(...heights, NODE_HEIGHT);

  const placed: PlacedNode[] = [];
  let x = PADDING;
  order.forEach((at, index) => {
    const ids = columns.get(at) as string[];
    const width = widthAt(at);
    // Each column is centred against the tallest, so the focal sits on the
    // middle line and the eye reads straight across rather than stepping.
    let y = PADDING + (tallest - heights[index]) / 2;
    for (const id of ids) {
      placed.push({ id, x, y, width, height: NODE_HEIGHT, depth: at });
      y += NODE_HEIGHT + ROW_GAP;
    }
    x += width + COLUMN_GAP;
  });

  return {
    nodes: placed,
    width: x - COLUMN_GAP + PADDING,
    height: tallest + PADDING * 2,
  };
}
