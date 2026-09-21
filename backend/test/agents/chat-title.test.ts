import { describe, expect, it } from "vitest";

import { conversationTitle } from "../../src/agents/chat/title";

/**
 * The rail's label for a conversation. The questions are ones the chat page
 * actually suggests, plus the shapes that used to end in an ellipsis.
 */

describe("conversationTitle", () => {
  const cases: { name: string; question: string; title: string }[] = [
    {
      name: "a long question becomes a label and never a cut sentence",
      question: "Which client had the most mismatches in the latest run, and on which field?",
      title: "Which client had the most",
    },
    {
      name: "a question shorter than the cap is left as it is, without its question mark",
      question: "Which of the seven fields differs most often?",
      title: "Which of the seven fields",
    },
    {
      name: "a leading clause is the whole subject, so it is where the label stops",
      question: "For run 31b950f4, how many emails needed a person?",
      title: "For run 31b950f4",
    },
    {
      name: "never ends on a word that carries nothing",
      question: "How many emails needed a person, by reason?",
      title: "How many emails needed",
    },
    { name: "a short question is itself", question: "Who sent the most?", title: "Who sent the most" },
    { name: "one word is a title", question: "Busan?", title: "Busan" },
    { name: "keeps an apostrophe inside a word", question: "What is the port's country?", title: "What is the port's country" },
    {
      name: "a first word longer than the cap still titles the conversation",
      question: "Antidisestablishmentarianismisationalism and everything after it",
      title: "Antidisestablishmentarianismisationalism",
    },
    { name: "collapses the whitespace a paste brings", question: "  Which   ports\n\nare in Asia?  ", title: "Which ports are in Asia" },
    { name: "nothing but spaces still names the conversation", question: "   ", title: "A new question" },
    { name: "nothing but punctuation still names the conversation", question: "???", title: "A new question" },
  ];

  it.each(cases)("$name", ({ question, title }) => {
    expect(conversationTitle(question)).toBe(title);
  });

  it("never ends in an ellipsis, which is the whole reason it exists", () => {
    for (const { question } of cases) expect(conversationTitle(question)).not.toMatch(/[.…]$/);
  });

  it("stays short enough to read in the rail", () => {
    for (const { question } of cases) {
      const title = conversationTitle(question);
      expect(title.split(" ").length).toBeLessThanOrEqual(5);
    }
  });
});
