import { describe, expect, it } from "vitest";

import type { ChatNextMove } from "@/lib/api/chat-agent-schemas";

import { orderMoves, outcomeLead } from "./moves";

function move(over: Partial<ChatNextMove> = {}): ChatNextMove {
  return {
    kind: "alternative",
    label: "a label",
    prompt: "a question?",
    thing: "A THING",
    count: 1,
    basis: "data",
    ...over,
  };
}

describe("orderMoves", () => {
  it("puts alternatives before follow-ups", () => {
    const moves = [
      move({ kind: "follow_up", label: "later" }),
      move({ kind: "alternative", label: "first" }),
      move({ kind: "follow_up", label: "also later" }),
    ];
    expect(orderMoves(moves).map((item) => item.label)).toEqual(["first", "later", "also later"]);
  });

  it("keeps the agent's own order within a kind, which is most relevant first", () => {
    const moves = [move({ label: "one" }), move({ label: "two" }), move({ label: "three" })];
    expect(orderMoves(moves).map((item) => item.label)).toEqual(["one", "two", "three"]);
  });

  it("does not mutate what it was given", () => {
    const moves = [move({ kind: "follow_up", label: "later" }), move({ label: "first" })];
    orderMoves(moves);
    expect(moves.map((item) => item.label)).toEqual(["later", "first"]);
  });

  it("has nothing to say about an empty list", () => {
    expect(orderMoves([])).toEqual([]);
  });
});

describe("outcomeLead", () => {
  const cases: { name: string; outcome: string; checked: string[]; lead: string | null }[] = [
    { name: "a miss that says where it looked", outcome: "none_found", checked: ["resolved ports"], lead: "Nothing found." },
    { name: "a partial answer that says where it looked", outcome: "partial", checked: ["subject lines"], lead: "Part of it." },
    { name: "a miss with nowhere named draws no line", outcome: "none_found", checked: [], lead: null },
    { name: "an ordinary answer", outcome: "answered", checked: ["resolved ports"], lead: null },
    { name: "a question back", outcome: "needs_input", checked: ["resolved ports"], lead: null },
  ];

  for (const item of cases) {
    it(item.name, () => {
      expect(outcomeLead({ outcome: item.outcome as never, checked: item.checked })).toBe(item.lead);
    });
  }
});
