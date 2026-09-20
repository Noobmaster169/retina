import { describe, expect, it } from "vitest";

import { filesWords, stepWords } from "../../src/routes/step-words";

/**
 * The words a queue slot and a queued row carry on the run page. Pure, and
 * table driven because the failure mode is a step nobody wrote a phrase for
 * silently reading as an empty cell.
 */

describe("stepWords", () => {
  const cases: [string, string][] = [
    ["classify", "reading the email"],
    ["classify-verify", "arguing the other case"],
    ["triage", "deciding what to do with it"],
    ["doc-type", "naming what each file is"],
    ["extract", "reading both documents"],
    ["extract-verify", "checking what it read"],
    ["field-judge", "judging the seven fields"],
  ];

  it.each(cases)("says what %s is doing", (step, words) => {
    expect(stepWords(step)).toBe(words);
  });

  it("falls back to a step's own name rather than to silence", () => {
    expect(stepWords("a-step-from-a-later-phase")).toBe("a-step-from-a-later-phase");
  });
});

describe("filesWords", () => {
  const cases: [string[], string][] = [
    [[], ""],
    [["email_004_SI.txt"], "one file, txt"],
    [["email_004_SI.txt", "email_004_BL.pdf"], "two files, txt and pdf"],
    [["a.xlsx", "b.xlsx"], "two files, xlsx and xlsx"],
    [["a.txt", "b.pdf", "c.docx"], "three files, txt, pdf and docx"],
  ];

  it.each(cases)("reads %j as its formats", (filenames, words) => {
    expect(filesWords(filenames)).toBe(words);
  });

  it("names a file with no extension rather than dropping it", () => {
    expect(filesWords(["attachment"])).toBe("one file, attachment");
  });

  it("counts past the names it has a word for", () => {
    expect(filesWords(["a.txt", "b.txt", "c.txt", "d.txt", "e.txt"])).toMatch(/^5 files, /);
  });

  it("lower cases an extension, because a queued row is not shouting", () => {
    expect(filesWords(["SCAN.PDF"])).toBe("one file, pdf");
  });
});
