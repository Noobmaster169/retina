import { describe, expect, it } from "vitest";

import { linkAnswer, linkedIds, type ResolvedMention } from "../../src/agents/chat/mentions";

/**
 * The rule under test: a link survives only where a tool on the turn printed
 * that id, and one that does not survive leaves the sentence readable.
 */

const shown: ResolvedMention[] = [
  { id: "412", kind: "party", canonical: "Evergreen Marine Corp" },
  { id: "77", kind: "port", canonical: "Singapore" },
];

describe("linkAnswer", () => {
  const cases: { name: string; answer: string; want: string }[] = [
    {
      name: "an id a tool printed becomes a link carrying its kind",
      answer: "[Evergreen Marine Corp](entity:412) shipped 14 of them.",
      want: "[Evergreen Marine Corp](entity:party/412) shipped 14 of them.",
    },
    {
      name: "an id nothing printed loses its markup and keeps its words",
      answer: "[Maersk Line](entity:900) shipped the rest.",
      want: "Maersk Line shipped the rest.",
    },
    {
      name: "two links in one sentence are decided one at a time",
      answer: "[Evergreen Marine Corp](entity:412) loaded at [Singapore](entity:77).",
      want: "[Evergreen Marine Corp](entity:party/412) loaded at [Singapore](entity:port/77).",
    },
    {
      name: "a kind the agent wrote itself is replaced by the one on the record",
      answer: "[Singapore](entity:party/77) is a port.",
      want: "[Singapore](entity:port/77) is a port.",
    },
    {
      name: "a ref that is not an id is not a link",
      answer: "[the run](entity:abc) covered 520 emails.",
      want: "the run covered 520 emails.",
    },
    {
      name: "an ordinary link is left alone",
      answer: "See [the brief](https://example.org/brief).",
      want: "See [the brief](https://example.org/brief).",
    },
    {
      name: "an answer with no links is returned unchanged",
      answer: "**14** of them differed at the consignee.",
      want: "**14** of them differed at the consignee.",
    },
    {
      name: "bold inside the link text survives",
      answer: "[**Evergreen Marine Corp**](entity:412) is the busiest.",
      want: "[**Evergreen Marine Corp**](entity:party/412) is the busiest.",
    },
  ];

  for (const one of cases) {
    it(one.name, () => expect(linkAnswer(one.answer, shown)).toBe(one.want));
  }

  it("keeps nothing when the turn called no tool", () => {
    expect(linkAnswer("[Singapore](entity:77) is busy.", [])).toBe("Singapore is busy.");
  });
});

describe("linkedIds", () => {
  it("reports the ids an answer linked, in order", () => {
    expect(linkedIds("[a](entity:party/412) and [b](entity:77) and [c](entity:x)")).toEqual(["412", "77"]);
  });
});
