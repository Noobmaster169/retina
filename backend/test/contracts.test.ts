import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { profileSchema } from "../src/agents";
import { AttributeSource, Category, ComparisonField, ComparisonStatus, PortAttributes, REFERENCE_PORT_KEYS, ReviewReason, SubmissionRow } from "../src/contracts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const scoringPy = readFileSync(join(repo, "emails", "server", "scoring.py"), "utf8");
const readme = readFileSync(join(repo, "emails", "data_v2", "README.md"), "utf8");
const migration = readFileSync(join(repo, "backend", "db", "migrations", "003_classifications_comparisons.sql"), "utf8");
const reviewMigration = readFileSync(join(repo, "backend", "db", "migrations", "005_documents_reviews.sql"), "utf8");

/** `NAME = ["a", "b"]` in scoring.py, as the organisers wrote it. */
function pythonList(name: string): string[] {
  const match = scoringPy.match(new RegExp(`^${name} = \\[([^\\]]*)\\]`, "m"));
  if (!match) throw new Error(`${name} not found in scoring.py`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** The values of one `check (column in (...))` in a migration. */
function sqlList(column: string, sql = migration): string[] {
  const match = sql.match(new RegExp(`check \\(${column} in \\(([^)]*)\\)\\)`));
  if (!match) throw new Error(`no check on ${column}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("the enums are the organisers', value for value", () => {
  it("category is scoring.py's CATEGORIES, in the contracts and in the database", () => {
    expect(Category.options).toEqual(pythonList("CATEGORIES"));
    expect(sqlList("final_category")).toEqual(pythonList("CATEGORIES"));
    expect(sqlList("gen_category")).toEqual(pythonList("CATEGORIES"));
    expect(sqlList("human_category")).toEqual(pythonList("CATEGORIES"));
  });

  it("review_reason is scoring.py's REVIEW_REASONS, in the contracts and in the database", () => {
    expect(ReviewReason.options).toEqual(pythonList("REVIEW_REASONS"));
    expect(sqlList("review_reason")).toEqual(pythonList("REVIEW_REASONS"));
    // A review case carries the same four and nothing else: a failed job is not a reason.
    expect(sqlList("reason", reviewMigration)).toEqual(pythonList("REVIEW_REASONS"));
  });

  it("status is the README's OK | MISMATCH | NEEDS_REVIEW", () => {
    const documented = readme.match(/"status": "MISMATCH",\s*\/\/ (.*)/)?.[1].split("|").map((s) => s.trim());
    expect(ComparisonStatus.options).toEqual(documented);
    expect(sqlList("status")).toEqual(documented);
  });

  it("the comparison fields are the README's seven", () => {
    const section = readme.slice(readme.indexOf("## The 7 comparison fields"));
    const documented = section.match(/`([^`]+)`/)?.[1].split(",").map((s) => s.trim());
    expect(ComparisonField.options).toEqual(documented);
    expect(documented).toHaveLength(7);
  });
});

describe("SubmissionRow", () => {
  const row = { category: "BL_COMPARISON", status: "OK", review_reason: null, has_defect: false, defect_fields: [], decided_by: "llm" };

  it("accepts a row made of the organisers' values", () => {
    expect(SubmissionRow.safeParse(row).success).toBe(true);
  });

  it.each([
    ["a review reason the organisers do not have", { review_reason: "low_confidence" }],
    ["another one", { review_reason: "processing_error" }],
    ["a category they do not have", { category: "PHISHING" }],
    ["a status they do not have", { status: "UNKNOWN" }],
    ["a field that is not one of the seven", { defect_fields: ["vessel"] }],
  ])("refuses %s", (_name, change) => {
    expect(SubmissionRow.safeParse({ ...row, ...change }).success).toBe(false);
  });
});

describe("a port's coordinates", () => {
  it("are attributes the profile step never writes", () => {
    expect(
      PortAttributes.parse({ country: null, region: null, subregion: null, locode: null, coast: null, countryCode: "SG", lat: "1.2644", lon: "103.8200" }).lat,
    ).toBe("1.2644");
    expect(REFERENCE_PORT_KEYS).toEqual(["countryCode", "lat", "lon"]);
    const shape = profileSchema("port").safeParse({
      summary: "s",
      observed: "o",
      general: null,
      generalConfidence: null,
      attributes: { country: null, region: null, subregion: null, locode: null, coast: null },
      attributeBasis: {},
      unknowns: [],
    });
    expect(shape.success).toBe(true);
  });

  it("may come from the reference list or a person", () => {
    expect(AttributeSource.parse({ source: "reference" }).source).toBe("reference");
    expect(AttributeSource.parse({ source: "human" }).source).toBe("human");
  });
});
