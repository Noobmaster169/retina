import { describe, expect, it } from "vitest";

import { proseFaults, sentenceCount } from "../../src/eval/chat-score.prose";

describe("sentenceCount", () => {
  it.each([
    ["Two sentences. Here is one more.", 2],
    ["email_334 differs on 0.45 of fields.", 1],
    ["A list:\n- one thing? really\n- two\n- three", 4],
    ["## Parts\nOne. Two.", 2],
    ["", 0],
  ])("%j is %i", (text, n) => {
    expect(sentenceCount(text)).toBe(n);
  });
});

describe("proseFaults", () => {
  it("passes an answer written for a business reader", () => {
    expect(proseFaults("Run 62753236 sorted 30 emails; 4 differed, all on consignee. The rest agreed.", "answered")).toEqual([]);
  });

  it.each([
    ["an em dash", "It differs — on the consignee.", "no dashes"],
    ["a table name", "Held in core.entities as one thing.", "no table names"],
    ["an offer", "None found. Let me know if you meant the group.", "no offer"],
    ["a greeting", "Hello! I can answer questions about the run.", "no greeting"],
    ["too many sentences", "One. Two. Three. Four. Five. Six. Seven. Eight. Nine.", "at most 8 sentences"],
    ["a closing question", "Four differed. What would you like next?", "no closing question"],
  ])("flags %s", (_name, text, rule) => {
    expect(proseFaults(text, "answered").map((fault) => fault.rule)).toContain(rule);
  });

  it("lets a clarifying answer end in its question", () => {
    expect(proseFaults("Two companies carry that name. Which one?", "needs_input").map((f) => f.rule)).not.toContain("no closing question");
  });
});
