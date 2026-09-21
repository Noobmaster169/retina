import { describe, expect, it } from "vitest";

import { safeName, storedNames } from "../../src/ingest/attachment-names";

/**
 * Two attachments of one email must never become one. The object key and the row
 * both key off the name, so a name shared by two different files meant the second
 * upload overwrote the first's bytes and then lost its own row: one row saying
 * `e_SI.pdf` over the bytes of `e_BL.pdf`, and an instruction compared against a
 * copy of itself reads OK.
 */

describe("the name an attachment is stored under", () => {
  it("is the file's own name when nothing else in the email wants it", () => {
    expect([...storedNames(["a/e_SI.pdf", "a/e_BL.pdf"]).values()]).toEqual(["e_BL.pdf", "e_SI.pdf"]);
  });

  it("numbers the second claim on a name, before the extension", () => {
    // The extension still decides the format, so `BL__2.pdf` is parsed as a PDF.
    const names = storedNames(["2024/BL.pdf", "2025/BL.pdf"]);
    expect([...names.values()].sort()).toEqual(["BL.pdf", "BL__2.pdf"]);
    expect(new Set(names.values()).size).toBe(2);
  });

  it("keeps going for a third and a fourth", () => {
    const names = storedNames(["a/BL.pdf", "b/BL.pdf", "c/BL.pdf", "d/BL.pdf"]);
    expect([...names.values()].sort()).toEqual(["BL.pdf", "BL__2.pdf", "BL__3.pdf", "BL__4.pdf"]);
  });

  it("does not collide when a numbered name is itself taken", () => {
    const names = storedNames(["a/BL.pdf", "b/BL.pdf", "c/BL__2.pdf"]);
    expect(new Set(names.values()).size).toBe(3);
  });

  it("gives one name to one path, however the inbox ordered them", () => {
    const paths = ["z/BL.pdf", "a/BL.pdf", "m/SI.pdf"];
    expect(storedNames(paths)).toEqual(storedNames([...paths].reverse()));
  });

  it("reads a path listed twice as the one attachment it is", () => {
    const names = storedNames(["a/BL.pdf", "a/BL.pdf"]);
    expect(names.size).toBe(1);
    expect(names.get("a/BL.pdf")).toBe("BL.pdf");
  });

  it("gives every attachment a name, and every name to exactly one", () => {
    const paths = ["a/BL.pdf", "b/BL.pdf", "c/BL.pdf", "d/SI.pdf", "e/SI.pdf"];
    const names = storedNames(paths);
    expect(names.size).toBe(paths.length);
    expect(new Set(names.values()).size).toBe(paths.length);
  });
});

describe("a name that could be something other than a name", () => {
  it.each([
    ["a directory above", "../../etc/passwd", "passwd"],
    ["a windows path", "C:\\docs\\BL.pdf", "BL.pdf"],
    ["a newline in the name", "a/B\nL.pdf", "BL.pdf"],
    ["nothing but a dot", "a/.", "attachment"],
    ["no name at all", "a/", "attachment"],
  ])("%s is made into one: %s", (_what, path, expected) => {
    expect(safeName(path)).toBe(expected);
  });

  it("still gives two unnameable files two names", () => {
    expect(new Set(storedNames(["a/", "b/"]).values()).size).toBe(2);
  });
});
