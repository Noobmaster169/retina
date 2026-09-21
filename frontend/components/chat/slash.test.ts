import { describe, expect, it } from "vitest";

import type { ChatSkillCard } from "@/lib/api/chat-thread-schemas";

import { matchingSkills, slashFilter } from "./slash";

const CARDS: ChatSkillCard[] = [
  { name: "near-misses", version: 1, when: "A lookup came back empty." },
  { name: "ask-back", version: 1, when: "A name meant things of more than one kind." },
  { name: "lanes-and-ports", version: 1, when: "The question is about a lane." },
];

describe("slashFilter", () => {
  const cases: { name: string; text: string; filter: string | null }[] = [
    { name: "a bare slash opens the menu with everything", text: "/", filter: "" },
    { name: "a word after it filters", text: "/near", filter: "near" },
    { name: "a hyphen is part of a skill name", text: "/ask-back", filter: "ask-back" },
    { name: "an ordinary question is not a command", text: "How many emails?", filter: null },
    { name: "a slash inside a question is not a command", text: "emails per 1/2 day", filter: null },
    { name: "a date is not a command", text: "20/09/2026", filter: null },
    { name: "a path is not a command, because it is not only a name", text: "/runs/abc/chat", filter: null },
    { name: "a slash with a space after it has stopped being a name", text: "/near misses", filter: null },
    { name: "nothing typed yet", text: "", filter: null },
  ];

  for (const item of cases) {
    it(item.name, () => {
      expect(slashFilter(item.text)).toBe(item.filter);
    });
  }
});

describe("matchingSkills", () => {
  it("reaches every skill on a bare slash", () => {
    expect(matchingSkills(CARDS, "").map((card) => card.name)).toEqual(["near-misses", "ask-back", "lanes-and-ports"]);
  });

  it("narrows to the ones whose name contains what was typed", () => {
    expect(matchingSkills(CARDS, "near").map((card) => card.name)).toEqual(["near-misses"]);
    expect(matchingSkills(CARDS, "s").map((card) => card.name)).toEqual(["near-misses", "ask-back", "lanes-and-ports"]);
  });

  it("matches the middle of a name, not only its start", () => {
    expect(matchingSkills(CARDS, "misses").map((card) => card.name)).toEqual(["near-misses"]);
  });

  it("returns nothing for a name no skill has, so the menu closes rather than lying", () => {
    expect(matchingSkills(CARDS, "nope")).toEqual([]);
  });
});
