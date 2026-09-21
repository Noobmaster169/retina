import { describe, expect, it } from "vitest";

import { optimistic } from "./pending-turn";
import { mergeTurns } from "./merge-turns";
import type { ChatTurn } from "@/lib/api/chat-agent-schemas";

/** A stored turn, which is any turn the server has given an id to. */
function turn(id: number, role: ChatTurn["role"], content: string): ChatTurn {
  return { ...optimistic(content), id, role };
}

const Q1 = turn(1, "user", "which ports are in Asia?");
const A1 = turn(2, "assistant", "Nine.");
const Q2 = turn(3, "user", "and which of them are disputed?");
const A2 = turn(4, "assistant", "Two.");

describe("mergeTurns", () => {
  it("takes the server's word where this session holds nothing", () => {
    expect(mergeTurns([Q1, A1], [])).toEqual([Q1, A1]);
  });

  it("keeps what this session holds where the server has nothing, which is a conversation it has not read", () => {
    expect(mergeTurns([], [Q1, A1])).toEqual([Q1, A1]);
  });

  /** The bug this exists for: the answer arrived here first and a stale render would have dropped it. */
  it("keeps an answer that landed after the render was taken", () => {
    expect(mergeTurns([Q1], [Q1, A1])).toEqual([Q1, A1]);
  });

  it("keeps a whole turn the server has not stored yet", () => {
    expect(mergeTurns([Q1, A1], [Q1, A1, Q2, A2])).toEqual([Q1, A1, Q2, A2]);
  });

  it("draws the question asked a moment ago, while the server still knows nothing of it", () => {
    const asking = optimistic("what about Busan?");
    expect(mergeTurns([Q1, A1], [Q1, A1, asking])).toEqual([Q1, A1, asking]);
  });

  it("gives way to the stored question rather than showing it twice", () => {
    const asking = optimistic("which ports are in Asia?");
    expect(mergeTurns([Q1, A1], [asking, A1])).toEqual([Q1, A1]);
  });

  it("prefers the server's copy of a turn they both hold", () => {
    const edited = { ...A1, content: "stale" };
    expect(mergeTurns([Q1, A1], [Q1, edited])).toEqual([Q1, A1]);
  });

  it("never repeats a turn", () => {
    const merged = mergeTurns([Q1, A1, Q2], [Q1, A1, Q2, A2]);
    expect(new Set(merged.map((one) => one.id)).size).toBe(merged.length);
  });

  it("keeps the order a thread is read in", () => {
    const merged = mergeTurns([Q1, A1], [Q1, A1, Q2, A2]);
    expect(merged.map((one) => one.id)).toEqual([1, 2, 3, 4]);
  });
});
