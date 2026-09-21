import { describe, expect, it } from "vitest";

import { countsOf, emphasisOf, FILTERS, narrow, search } from "./inbox-filters";
import { type InboxRow, mergeRows, needsYou } from "./inbox-rows";
import type { ReviewCaseItem } from "@/lib/api/review-schemas";
import type { RunEmailItem } from "@/lib/api/trace-schemas";

/**
 * Rows copied from a real run: three parked emails of the Needs a person
 * queue, one clean pair, one with a differing field, one sorted into a
 * category that asks for no check, and one still moving.
 */

function email(over: Partial<RunEmailItem> & { emailId: string }): RunEmailItem {
  return {
    from: "deswita elvyani <deswita_elvyani@aprilasia.com>",
    subject: "AFPTME - BUSAN, SOUTH KOREA",
    stage: "done",
    attachmentCount: 2,
    outcome: "OK",
    category: "BL_COMPARISON",
    decidedBy: "llm",
    confidence: 0.94,
    verifierCategory: null,
    defectFields: [],
    error: null,
    ...over,
  };
}

function openCase(over: Partial<ReviewCaseItem> & { emailId: string }): ReviewCaseItem {
  return {
    id: `case_${over.emailId}`,
    runId: "fa0f8e38-0000-4000-8000-000000000000",
    subject: "REQUEST BL DRAFT",
    from: "hanna azhari <hanna_azhari@aprilasia.com>",
    kind: "review",
    reason: "unreadable",
    stage: "compare",
    status: "open",
    openedAt: "2026-09-20T10:00:00.000Z",
    actions: 0,
    lastActionAt: null,
    lastActionBy: null,
    ...over,
  };
}

const ARLENE = "arlene yamomo <arlene_yamomo@aprilasia.com>";
const HANNA = "hanna azhari <hanna_azhari@aprilasia.com>";
const BUDI = "budi santoso <budi_santoso@aprilasia.com>";

const EMAILS: RunEmailItem[] = [
  email({ emailId: "email_9", outcome: "OK" }),
  email({ emailId: "email_10", from: ARLENE, outcome: "MISMATCH", defectFields: ["consignee", "port_of_discharge"] }),
  email({ emailId: "email_506", from: ARLENE, outcome: "missing_attachment", stage: "review", subject: "RE_ AFRT - LONG BEACH" }),
  email({ emailId: "email_512", from: HANNA, outcome: "unreadable", stage: "review", subject: "REQUEST BL DRAFT" }),
  email({ emailId: "email_519", outcome: "missing_value", stage: "review" }),
  email({ emailId: "email_600", from: "promo@cruise.example", outcome: "not_comparable", category: "SPAM", subject: "Win a cruise" }),
  email({ emailId: "email_700", outcome: null, stage: "comparing" }),
  email({ emailId: "email_800", from: BUDI, outcome: null, stage: "failed", error: "doc-extract timed out" }),
];

const CASES: ReviewCaseItem[] = [
  openCase({ emailId: "email_512", reason: "unreadable", openedAt: "2026-09-20T09:00:00.000Z" }),
  openCase({ emailId: "email_506", reason: "missing_attachment", openedAt: "2026-09-20T11:00:00.000Z", actions: 1, lastActionBy: "kai" }),
];

const ROWS = mergeRows(EMAILS, CASES);
const idsOf = (rows: InboxRow[]) => rows.map((row) => row.emailId);

describe("mergeRows", () => {
  it("hangs the open case on its own email and leaves every other row without one", () => {
    const byId = new Map(ROWS.map((row) => [row.emailId, row]));
    expect(byId.get("email_506")?.openCase).toMatchObject({ reason: "missing_attachment", actions: 1, lastActionBy: "kai" });
    expect(byId.get("email_519")?.openCase).toBeNull();
  });

  it("keeps a settled reason out of `needs you`, because nobody has to answer for it any more", () => {
    const settled = ROWS.find((row) => row.emailId === "email_519");
    expect(settled?.outcome).toBe("missing_value");
    expect(needsYou(settled as InboxRow)).toBe(false);
  });

  it("counts a job that stopped as needing a person even where no case was raised", () => {
    expect(needsYou(ROWS.find((row) => row.emailId === "email_800") as InboxRow)).toBe(true);
  });
});

describe("search", () => {
  const cases: { name: string; query: string; expect: string[] }[] = [
    { name: "an empty query keeps every row", query: "", expect: idsOf(ROWS) },
    { name: "an id", query: "email_512", expect: ["email_512"] },
    { name: "a subject word, ignoring case", query: "busan", expect: ["email_9", "email_10", "email_519", "email_700", "email_800"] },
    { name: "a category nobody built a chip for", query: "spam", expect: ["email_600"] },
    { name: "a review reason", query: "unreadable", expect: ["email_512"] },
    { name: "a differing field name", query: "consignee", expect: ["email_10"] },
    { name: "a sender", query: "hanna", expect: ["email_512"] },
    { name: "two words, both of which must appear", query: "busan mismatch", expect: ["email_10"] },
    { name: "two words that never share a row", query: "spam busan", expect: [] },
  ];

  for (const one of cases) {
    it(one.name, () => expect(idsOf(search(ROWS, one.query))).toEqual(one.expect));
  }
});

describe("countsOf", () => {
  it("counts every chip over the same rows, letting one row answer two questions", () => {
    expect(countsOf(ROWS)).toEqual({
      all: 8,
      "needs-you": 3,
      differences: 1,
      agreed: 1,
      "awaiting-draft": 0,
      "no-check": 1,
      settled: 1,
      moving: 1,
      failed: 1,
    });
  });

  it("counts over what the search left and not over the run", () => {
    expect(countsOf(search(ROWS, "busan")).all).toBe(5);
  });
});

/**
 * A comparison request whose draft has not been sent yet. It is sorted as a
 * check and ends with nothing checked, so it is neither a clean pair nor an
 * email that never needed one. Its own rows here rather than in ROWS, whose
 * order several sort cases above are written against.
 */
describe("the emails waiting for a draft", () => {
  const rows = mergeRows(
    [
      email({ emailId: "email_003", outcome: "awaiting_draft", attachmentCount: 0 }),
      email({ emailId: "email_004", outcome: "awaiting_draft", attachmentCount: 0 }),
      email({ emailId: "email_005", outcome: "OK" }),
    ],
    [],
  );

  it("has a chip of its own that finds exactly them", () => {
    expect(narrow(rows, "awaiting-draft", "id").map((row) => row.emailId)).toEqual(["email_003", "email_004"]);
  });

  it("leaves Agreed to the pairs that were actually read", () => {
    expect(narrow(rows, "agreed", "id").map((row) => row.emailId)).toEqual(["email_005"]);
  });

  it("is not a row that never needed a check, which is a different thing entirely", () => {
    expect(narrow(rows, "no-check", "id")).toEqual([]);
  });

  it("is finished, so it is not still moving", () => {
    expect(narrow(rows, "moving", "id")).toEqual([]);
  });
});

describe("narrow", () => {
  const cases: { name: string; filter: Parameters<typeof narrow>[1]; sort: Parameters<typeof narrow>[2]; expect: string[] }[] = [
    { name: "ids sort by number and not by text", filter: "all", sort: "id", expect: ["email_9", "email_10", "email_506", "email_512", "email_519", "email_600", "email_700", "email_800"] },
    { name: "the oldest waiting case comes first, then the rest by urgency", filter: "all", sort: "attention", expect: ["email_512", "email_506", "email_800", "email_10", "email_700", "email_9", "email_519", "email_600"] },
    { name: "most differing fields first", filter: "all", sort: "differences", expect: ["email_10", "email_9", "email_506", "email_512", "email_519", "email_600", "email_700", "email_800"] },
    { name: "needs you holds the two cases and the failed job", filter: "needs-you", sort: "id", expect: ["email_506", "email_512", "email_800"] },
    { name: "differences holds only a judged defect", filter: "differences", sort: "id", expect: ["email_10"] },
    { name: "no check holds what was never compared", filter: "no-check", sort: "id", expect: ["email_600"] },
    { name: "settled holds a reason that was answered", filter: "settled", sort: "id", expect: ["email_519"] },
    { name: "still moving excludes a job that stopped", filter: "moving", sort: "id", expect: ["email_700"] },
    { name: "failed holds only the job that stopped, which needs you counts too", filter: "failed", sort: "id", expect: ["email_800"] },
  ];

  for (const one of cases) {
    it(one.name, () => expect(idsOf(narrow(ROWS, one.filter, one.sort))).toEqual(one.expect));
  }

  it("leaves the caller's array alone", () => {
    const before = idsOf(ROWS);
    narrow(ROWS, "all", "differences");
    expect(idsOf(ROWS)).toEqual(before);
  });

  it("sorts by sender name and not by the header it came in", () => {
    expect(idsOf(narrow(ROWS, "needs-you", "sender"))).toEqual(["email_506", "email_800", "email_512"]);
  });
});

describe("FILTERS", () => {
  it("names every key once, so a chip cannot be drawn twice", () => {
    expect(new Set(FILTERS.map((filter) => filter.key)).size).toBe(FILTERS.length);
  });
});

describe("emphasisOf", () => {
  const cases: [string, Parameters<typeof emphasisOf>, ReturnType<typeof emphasisOf>][] = [
    ["the chosen chip is filled whatever it holds", ["review", 0, true], "chosen"],
    ["a chosen neutral chip is still filled", ["neutral", 30, true], "chosen"],
    ["Needs you with rows asks", ["review", 4, false], "asking"],
    ["Failed with rows asks", ["fault", 1, false], "asking"],
    ["Needs you at zero is not important", ["review", 0, false], "empty"],
    ["Differences with rows holds", ["differ", 10, false], "holding"],
    ["Agreed with rows holds", ["match", 30, false], "holding"],
    ["Still moving with rows holds", ["signal", 2, false], "holding"],
    ["a neutral chip stays grey however many rows it has", ["neutral", 520, false], "empty"],
  ];

  it.each(cases)("%s", (_name, args, want) => {
    expect(emphasisOf(...args)).toBe(want);
  });
});
