import { describe, expect, it } from "vitest";

import { layoutGraph, type LayoutInput } from "./layout";

/**
 * The shape the Links canvas draws: a client and a port pointing at an email,
 * the email carrying two documents, those judged into one comparison, and two
 * differences found by it.
 */
const EMAIL_GRAPH: LayoutInput = {
  nodes: [
    { id: "client:algurg.ae", focal: false },
    { id: "port:1", focal: false },
    { id: "email:email_004", focal: true },
    { id: "document:1", focal: false },
    { id: "document:2", focal: false },
    { id: "comparison:1", focal: false },
    { id: "difference:1", focal: false },
    { id: "difference:2", focal: false },
  ],
  edges: [
    { from: "client:algurg.ae", to: "email:email_004" },
    { from: "port:1", to: "email:email_004" },
    { from: "email:email_004", to: "document:1" },
    { from: "email:email_004", to: "document:2" },
    { from: "document:1", to: "comparison:1" },
    { from: "document:2", to: "comparison:1" },
    { from: "comparison:1", to: "difference:1" },
    { from: "comparison:1", to: "difference:2" },
  ],
};

function at(layout: ReturnType<typeof layoutGraph>, id: string) {
  const node = layout.nodes.find((placed) => placed.id === id);
  if (!node) throw new Error(`${id} was not placed`);
  return node;
}

describe("layoutGraph", () => {
  it("puts what points at the focal on its left and what it points at on its right", () => {
    const layout = layoutGraph(EMAIL_GRAPH);
    expect(at(layout, "client:algurg.ae").depth).toBe(-1);
    expect(at(layout, "email:email_004").depth).toBe(0);
    expect(at(layout, "document:1").depth).toBe(1);
    expect(at(layout, "comparison:1").depth).toBe(2);
    expect(at(layout, "difference:1").depth).toBe(3);

    expect(at(layout, "client:algurg.ae").x).toBeLessThan(at(layout, "email:email_004").x);
    expect(at(layout, "email:email_004").x).toBeLessThan(at(layout, "document:1").x);
    expect(at(layout, "comparison:1").x).toBeLessThan(at(layout, "difference:1").x);
  });

  it("gives every node of a column the same x and stacks them down", () => {
    const layout = layoutGraph(EMAIL_GRAPH);
    expect(at(layout, "document:1").x).toBe(at(layout, "document:2").x);
    expect(at(layout, "document:2").y).toBeGreaterThan(at(layout, "document:1").y);
    expect(at(layout, "difference:1").x).toBe(at(layout, "difference:2").x);
  });

  it("centres each column, so the focal sits on the middle line", () => {
    const layout = layoutGraph(EMAIL_GRAPH);
    const middle = layout.height / 2;
    const focal = at(layout, "email:email_004");
    expect(focal.y + focal.height / 2).toBeCloseTo(middle, 5);
  });

  it("is the same layout every time, which is the point of not simulating it", () => {
    const first = layoutGraph(EMAIL_GRAPH);
    const second = layoutGraph(EMAIL_GRAPH);
    expect(second.nodes).toEqual(first.nodes);
    expect([second.width, second.height]).toEqual([first.width, first.height]);
  });

  it("places a node no edge reaches rather than dropping it", () => {
    const layout = layoutGraph({
      nodes: [
        { id: "email:a", focal: true },
        { id: "party:orphan", focal: false },
      ],
      edges: [],
    });
    expect(layout.nodes.map((node) => node.id).sort()).toEqual(["email:a", "party:orphan"]);
  });

  it("terminates on a cycle instead of spinning", () => {
    const layout = layoutGraph({
      nodes: [
        { id: "a", focal: true },
        { id: "b", focal: false },
        { id: "c", focal: false },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "a" },
      ],
    });
    expect(layout.nodes).toHaveLength(3);
  });

  it("takes the first node as the focal when none is marked, and is empty on nothing", () => {
    const unmarked = layoutGraph({ nodes: [{ id: "only", focal: false }], edges: [] });
    expect(at(unmarked, "only").depth).toBe(0);

    const nothing = layoutGraph({ nodes: [], edges: [] });
    expect(nothing.nodes).toEqual([]);
  });

  it("sizes the canvas to hold everything it placed", () => {
    const layout = layoutGraph(EMAIL_GRAPH);
    for (const node of layout.nodes) {
      expect(node.x + node.width).toBeLessThanOrEqual(layout.width);
      expect(node.y + node.height).toBeLessThanOrEqual(layout.height);
    }
  });
});
