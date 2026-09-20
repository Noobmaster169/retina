import { describe, expect, it } from "vitest";

import type { ChatNextMove } from "../../src/contracts";
import { keepReal, problemWith, settle } from "../../src/agents/chat/next-moves";

/**
 * The rule under test: an alternative is real or it is not offered.
 *
 * Every case here is a way a plausible answer could be wrong. The grounds are
 * written as the tools write them, tab separated with one thing per row,
 * because "beside it in a result" means on the row, not anywhere in 20 kB.
 */

const PORTS = [
  "port\tloading_emails\tdischarge_emails",
  "HOCHIMINH CITY, VIETNAM\t0\t11",
  "CEBU, PHILIPPINES\t0\t3",
  "YANGON, MYANMAR\t0\t9",
  "BUATAN, INDONESIA\t19\t0",
].join("\n");

function move(over: Partial<ChatNextMove> = {}): ChatNextMove {
  return {
    kind: "alternative",
    label: "Ho Chi Minh City",
    prompt: "Which shipments go to Ho Chi Minh City?",
    thing: "HOCHIMINH CITY, VIETNAM",
    count: 11,
    basis: "general_knowledge",
    ...over,
  };
}

describe("keepReal", () => {
  const question = "Do we have any shipments to Jakarta, Indonesia?";

  const cases: { name: string; moves: ChatNextMove[]; grounds: string[]; kept: string[] }[] = [
    {
      name: "an alternative whose thing and count came back on one row is kept",
      moves: [move()],
      grounds: [PORTS],
      kept: ["Ho Chi Minh City"],
    },
    {
      name: "an invented port is dropped, whatever number it carries",
      moves: [move({ label: "Jakarta", thing: "JAKARTA, INDONESIA", count: 4 })],
      grounds: [PORTS],
      kept: [],
    },
    {
      name: "a real port with a number that was never beside it is dropped",
      moves: [move({ count: 40 })],
      grounds: [PORTS],
      kept: [],
    },
    {
      name: "a number from another port's row does not ground this one",
      moves: [move({ count: 3 })],
      grounds: [PORTS],
      kept: [],
    },
    {
      name: "a thing from one call and a number from another are not a pair",
      moves: [move()],
      grounds: ["port\nHOCHIMINH CITY, VIETNAM", "emails\n11"],
      kept: [],
    },
    {
      name: "an alternative with no count needs only its thing",
      moves: [move({ count: null })],
      grounds: [PORTS],
      kept: ["Ho Chi Minh City"],
    },
    {
      name: "an alternative that names no thing is not an alternative",
      moves: [move({ thing: null, count: null })],
      grounds: [PORTS],
      kept: [],
    },
    {
      name: "a follow-up carries no thing and is kept without grounding",
      moves: [move({ kind: "follow_up", label: "All destinations", prompt: "Which ports is cargo discharged at?", thing: null, count: null, basis: "data" })],
      grounds: [],
      kept: ["All destinations"],
    },
    {
      name: "a follow-up that does name a thing is held to the same rule",
      moves: [move({ kind: "follow_up", thing: "SURABAYA, INDONESIA", count: 2 })],
      grounds: [PORTS],
      kept: [],
    },
    {
      name: "a move that repeats the question just asked is dropped",
      moves: [move({ kind: "follow_up", prompt: "Do we have any shipments to Jakarta, Indonesia?", thing: null, count: null })],
      grounds: [PORTS],
      kept: [],
    },
    {
      name: "the repeat check ignores case and trailing punctuation",
      moves: [move({ kind: "follow_up", prompt: "do we have any shipments to jakarta, indonesia", thing: null, count: null })],
      grounds: [PORTS],
      kept: [],
    },
    {
      name: "two moves that ask the same thing are offered once",
      moves: [
        move({ kind: "follow_up", label: "First", prompt: "Which ports is cargo discharged at?", thing: null, count: null }),
        move({ kind: "follow_up", label: "Second", prompt: "Which ports is cargo discharged at?", thing: null, count: null }),
      ],
      grounds: [],
      kept: ["First"],
    },
    {
      name: "a count with nothing to attach it to cannot be checked",
      moves: [move({ kind: "follow_up", thing: null, count: 11 })],
      grounds: [PORTS],
      kept: [],
    },
    {
      name: "a fragment of a stored name does not ground a thing",
      moves: [move({ thing: "CEB", count: 3 })],
      grounds: [PORTS],
      kept: [],
    },
    {
      name: "a whole word of a stored name does, and it is the same row",
      moves: [move({ label: "Cebu", thing: "CEBU", count: 3 })],
      grounds: [PORTS],
      kept: ["Cebu"],
    },
    {
      name: "a count inside a longer number does not ground it",
      moves: [move({ thing: "BUATAN, INDONESIA", count: 1 })],
      grounds: [PORTS],
      kept: [],
    },
    {
      name: "at most four survive",
      moves: [
        move({ label: "one", prompt: "a?" }),
        move({ label: "two", prompt: "b?" }),
        move({ label: "three", prompt: "c?" }),
        move({ label: "four", prompt: "d?" }),
        move({ label: "five", prompt: "e?" }),
      ],
      grounds: [PORTS],
      kept: ["one", "two", "three", "four"],
    },
  ];

  for (const item of cases) {
    it(item.name, () => {
      expect(keepReal(item.moves, item.grounds, question).map((kept) => kept.label)).toEqual(item.kept);
    });
  }

  it("keeps the order the agent put them in, which is most relevant first", () => {
    const moves = [
      move({ label: "Cebu", prompt: "a?", thing: "CEBU, PHILIPPINES", count: 3 }),
      move({ label: "Yangon", prompt: "b?", thing: "YANGON, MYANMAR", count: 9 }),
    ];
    expect(keepReal(moves, [PORTS], question).map((kept) => kept.label)).toEqual(["Cebu", "Yangon"]);
  });
});

describe("problemWith", () => {
  it("refuses none_found that does not say where it looked", () => {
    expect(problemWith({ outcome: "none_found", checked: [], clarify: null })).toContain("checked");
  });

  it("accepts none_found that says where it looked", () => {
    expect(problemWith({ outcome: "none_found", checked: ["resolved ports"], clarify: null })).toBeNull();
  });

  it("refuses needs_input with no question to answer", () => {
    expect(problemWith({ outcome: "needs_input", checked: [], clarify: null })).toContain("clarify");
  });

  it("accepts needs_input that offers the choices", () => {
    const clarify = { question: "Which Singapore?", options: ["the port", "companies with a Singapore address"] };
    expect(problemWith({ outcome: "needs_input", checked: [], clarify })).toBeNull();
  });

  it("asks nothing of an ordinary answer", () => {
    expect(problemWith({ outcome: "answered", checked: [], clarify: null })).toBeNull();
    expect(problemWith({ outcome: "partial", checked: [], clarify: null })).toBeNull();
  });
});

describe("settle", () => {
  it("leaves a sound claim alone", () => {
    const claims = { outcome: "none_found" as const, checked: ["subject lines"], clarify: null };
    expect(settle(claims)).toEqual(claims);
  });

  it("drops a claim whose evidence never arrived, and keeps the answer", () => {
    expect(settle({ outcome: "none_found", checked: [], clarify: null })).toEqual({
      outcome: "answered",
      checked: [],
      clarify: null,
    });
  });

  it("drops the question with the outcome that obliged it", () => {
    expect(settle({ outcome: "needs_input", checked: [], clarify: null }).outcome).toBe("answered");
  });
});
