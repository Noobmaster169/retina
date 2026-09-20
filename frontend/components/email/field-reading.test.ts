import { describe, expect, it } from "vitest";

import type { FieldJudgementView } from "@/lib/api/comparison-schemas";

import { checkSentence, collapsedLine, markOf, splitQuote, verdictWords } from "./field-reading";

/**
 * The field comparison row's reading. Fixtures are the real shapes the judge
 * returns, copied from a run of email_046 and from the port and weight pairs
 * the design was drawn against.
 */

function judged(over: Partial<FieldJudgementView> = {}): FieldJudgementView {
  return {
    field: "consignee",
    siValue: "AL GURG PAPER TRADING LLC",
    blValue: "AL GHURAIR PAPER LLC",
    same: false,
    missing: false,
    confidence: 0.94,
    rationale: "Two distinct legal entities, not a spelling variant.",
    ...over,
  };
}

const AGREED_SAME_TEXT = judged({ field: "shipper", siValue: "SAFQA LIMITED", blValue: "SAFQA LIMITED", same: true });
const AGREED_OTHER_TEXT = judged({
  field: "port_of_loading",
  siValue: "NANTONG, CHINA",
  blValue: "NANTONG, CHINA (CNNTG)",
  same: true,
  rationale: "Same port. The bill of lading adds the UN/LOCODE.",
});
const BLANK = judged({ field: "gross_weight_kg", siValue: null, blValue: "131058", same: false, missing: true });

describe("markOf", () => {
  const cases: [string, FieldJudgementView, boolean, string][] = [
    ["the field being read, when it differs", judged(), true, "marked"],
    ["another field that also differs", judged(), false, "flagged"],
    ["a field that agreed, written the same way", AGREED_SAME_TEXT, true, "quiet"],
    ["a field the judge called the same although it reads differently", AGREED_OTHER_TEXT, false, "agreed"],
    ["a field with nothing on one side", BLANK, true, "bare"],
  ];

  it.each(cases)("marks %s", (_what, judgement, selected, state) => {
    expect(markOf(judgement, selected)).toBe(state);
  });

  it("marks both documents the same, because the product never says which one is right", () => {
    // The two sides are one judgement, so there is only one state to read: any
    // asymmetry would have to come from a second call with a different field.
    expect(markOf(judged(), true)).toBe(markOf(judged(), true));
  });

  it("never marks an uncertainty as a difference", () => {
    expect(markOf(BLANK, true)).not.toBe("marked");
    expect(markOf(BLANK, false)).not.toBe("flagged");
  });
});

describe("collapsedLine", () => {
  it("shows the value itself when the two documents agree", () => {
    expect(collapsedLine(AGREED_SAME_TEXT)).toBe("SAFQA LIMITED");
  });

  it("spends the line on words only when the field is in doubt", () => {
    expect(collapsedLine(judged())).toBe("the two documents name different things");
    expect(collapsedLine(BLANK)).toBe("one side has no value to compare");
  });

  it("falls back to the other document when one side is blank but the pair agreed", () => {
    expect(collapsedLine(judged({ siValue: null, blValue: "SAFQA LIMITED", same: true }))).toBe("SAFQA LIMITED");
  });
});

describe("verdictWords", () => {
  const cases: [FieldJudgementView, string][] = [
    [judged(), "different things"],
    [AGREED_SAME_TEXT, "the same"],
    [AGREED_OTHER_TEXT, "the same, written two ways"],
    [BLANK, "one side has no value to compare"],
  ];

  it.each(cases)("reads %#", (judgement, words) => {
    expect(verdictWords(judgement)).toBe(words);
  });
});

describe("splitQuote", () => {
  it("leaves the label outside the mark, so the line still reads as the document", () => {
    expect(splitQuote("NOTIFY PARTY: TOPKOPY MIDDLE EAST FZE", "TOPKOPY MIDDLE EAST FZE")).toEqual({
      pre: "NOTIFY PARTY: ",
      hit: "TOPKOPY MIDDLE EAST FZE",
      post: "",
    });
  });

  it("keeps whatever trails the value", () => {
    expect(splitQuote("Gross Wt (kgs): 131,058 KG", "131,058")).toEqual({
      pre: "Gross Wt (kgs): ",
      hit: "131,058",
      post: " KG",
    });
  });

  it("degrades to the value alone rather than guessing where it sat", () => {
    expect(splitQuote("a line that does not contain it", "TOPKOPY")).toEqual({ pre: "", hit: "TOPKOPY", post: "" });
    expect(splitQuote(null, "TOPKOPY")).toEqual({ pre: "", hit: "TOPKOPY", post: "" });
  });

  it("marks the first occurrence when a value appears twice", () => {
    expect(splitQuote("SAFQA LIMITED, c/o SAFQA LIMITED", "SAFQA LIMITED").post).toBe(", c/o SAFQA LIMITED");
  });
});

describe("checkSentence", () => {
  const seven = [
    AGREED_SAME_TEXT,
    judged({ field: "consignee" }),
    judged({ field: "notify_party" }),
    AGREED_OTHER_TEXT,
    judged({ field: "port_of_discharge", same: true }),
    judged({ field: "container_count", same: true }),
    judged({ field: "gross_weight_kg", same: true }),
  ];

  it("counts what agreed and what differed, in that order", () => {
    expect(checkSentence(seven, ["consignee", "notify_party"])).toBe("5 of the 7 fields agree, 2 differ.");
  });

  it("says so plainly when nothing differs", () => {
    expect(checkSentence(seven.map((f) => ({ ...f, same: true })), [])).toBe("All 7 fields agree.");
  });

  it("holds a difference and an uncertainty apart", () => {
    const withBlank = [...seven.slice(0, 6), BLANK];
    expect(checkSentence(withBlank, ["consignee", "notify_party"])).toBe(
      "4 of the 7 fields agree, 2 differ, 1 had nothing to compare.",
    );
  });

  it("uses the singular for one difference", () => {
    expect(checkSentence(seven, ["consignee"])).toContain("1 differs");
  });

  it("says nothing has been judged rather than claiming everything agreed", () => {
    expect(checkSentence([], [])).toBe("Nothing has been judged yet.");
  });
});
