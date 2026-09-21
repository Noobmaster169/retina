import { describe, expect, it } from "vitest";

import { type Injected, MAX_INJECTED, skillsToInject, type TurnFacts } from "../../src/agents/chat/inject";
import { renderOrientation } from "../../src/agents/chat/orientation";
import { loadRecipes } from "../../src/agents/chat/skills/recipes";
import { loadSkills, parseSkill, skillCards, skillText } from "../../src/agents/chat/skills/registry";
import { standing, standingText } from "../../src/agents/chat/standing";
import { TOOL_NAMES } from "../../src/agents/chat/tools";
import { loadPrompt } from "../../src/agents/prompts/registry";
import type { OrientationSnapshot } from "../../src/ontology/repositories/orientation.repo";

const NONE: TurnFacts = {
  scope: { runId: null, emailId: null },
  guardRefused: false,
  cameUpEmpty: false,
  ambiguous: false,
  gaveMeaning: false,
  loaded: [],
  sticky: [],
  picked: [],
};
const KNOWN = new Set(["ground-names", "pick-the-run", "explain-an-email", "time-questions", "lanes-and-ports", "near-misses", "ask-back"]);
const names = (list: Injected[]) => list.map((item) => item.name);

describe("skillsToInject", () => {
  const cases: { name: string; facts: Partial<TurnFacts>; expected: string[] }[] = [
    { name: "nothing seen, nothing injected", facts: {}, expected: [] },
    { name: "a conversation about a run", facts: { scope: { runId: "r", emailId: null } }, expected: ["pick-the-run"] },
    { name: "a conversation about an email, which also has a run", facts: { scope: { runId: "r", emailId: "e" } }, expected: ["explain-an-email"] },
    { name: "a guard refusal", facts: { guardRefused: true }, expected: ["ground-names"] },
    { name: "a lookup that came up empty", facts: { cameUpEmpty: true }, expected: ["ground-names", "near-misses"] },
    { name: "a name that meant two kinds of thing", facts: { ambiguous: true }, expected: ["ask-back"] },
    {
      name: "a lookup that came up empty and was also ambiguous asks after it widens",
      facts: { cameUpEmpty: true, ambiguous: true },
      expected: ["ground-names", "near-misses", "ask-back"],
    },
    { name: "a skill loaded on this turn stays for its later steps", facts: { loaded: ["time-questions"] }, expected: ["time-questions"] },
    { name: "a skill from earlier in the conversation", facts: { sticky: ["lanes-and-ports"] }, expected: ["lanes-and-ports"] },
    {
      name: "what the person picked comes first, and the list stops at the cap",
      facts: { picked: ["lanes-and-ports"], cameUpEmpty: true, scope: { runId: "r", emailId: null }, sticky: ["time-questions"] },
      expected: ["lanes-and-ports", "ground-names", "near-misses"],
    },
    { name: "a skill that no longer exists is dropped, not an error", facts: { sticky: ["gone"], picked: ["also-gone"] }, expected: [] },
    { name: "the same skill twice is once", facts: { loaded: ["ground-names"], guardRefused: true }, expected: ["ground-names"] },
  ];
  it.each(cases)("$name", ({ facts, expected }) => {
    const injected = skillsToInject({ ...NONE, ...facts }, KNOWN);
    expect(names(injected)).toEqual(expected);
    expect(injected.length).toBeLessThanOrEqual(MAX_INJECTED);
  });

  it("records how each one got there", () => {
    const injected = skillsToInject({ ...NONE, picked: ["lanes-and-ports"], loaded: ["time-questions"], guardRefused: true }, KNOWN);
    expect(injected).toEqual([
      { name: "lanes-and-ports", how: "picked" },
      { name: "time-questions", how: "loaded" },
      { name: "ground-names", how: "injected" },
    ]);
  });
});

const SNAPSHOT: OrientationSnapshot = {
  runs: 3,
  latestRun: { id: "11111111-1111-4111-8111-111111111111", totalEmails: 24, createdAt: "2026-09-19T10:00:00.000Z", status: "completed" },
  run: { id: "11111111-1111-4111-8111-111111111111", scoped: false, emails: 24, stages: [{ label: "done", count: 20 }, { label: "review", count: 4 }] },
  categories: [{ label: "BL_COMPARISON", count: 24 }],
  comparisons: [{ label: "OK", count: 10 }, { label: "MISMATCH", count: 8 }],
  reviews: [{ label: "missing_value", count: 4 }],
  judgedEmails: 18,
  ports: { rows: [{ id: "7", kind: "port", canonical: "PORT ALPHA, ATLANTIS", mentions: 9, emails: 5 }], total: 1 },
  parties: { rows: [{ id: "3", kind: "party", canonical: "ACME CO", mentions: 4, emails: 2 }], total: 41 },
  senderDomains: [{ label: "example.test", count: 12 }],
  watermark: "w",
};

describe("renderOrientation", () => {
  it("names the run, the figures, every thing with its id, and what is not there", () => {
    const text = renderOrientation(SNAPSHOT);
    expect(text).toContain("names no run, so the figures below are for the latest run, 11111111");
    expect(text).toContain("By stage: done 20, review 4.");
    expect(text).toContain("compared field by field: 18.");
    expect(text).toContain("Ports: all 1.");
    expect(text).toContain("[7] PORT ALPHA, ATLANTIS (5 emails)");
    expect(text).toContain("Parties: 41 in all. The 1 most mentioned are below; list_entities reaches the other 40.");
    expect(text).toContain("example.test 12");
    expect(text).toContain("when an email was sent");
  });

  it("says a scoped conversation's figures are for its run", () => {
    expect(renderOrientation({ ...SNAPSHOT, run: { ...SNAPSHOT.run!, scoped: true } })).toContain("This conversation is about run");
  });

  it("says there is nothing to count before the first run", () => {
    const empty = renderOrientation({ ...SNAPSHOT, runs: 0, latestRun: null, run: null, ports: { rows: [], total: 0 }, parties: { rows: [], total: 0 } });
    expect(empty).toContain("There are no runs yet");
    expect(empty).toContain("Ports: none resolved yet.");
  });
});

describe("the skills that ship", () => {
  const all = loadSkills();
  const recipes = loadRecipes();

  it("are the sixteen that ship, each with a version and a sentence on when", () => {
    expect([...all.keys()].sort()).toEqual([
      "ask-back", "ask-for-the-document", "counts-and-rates", "draft-the-shipment", "explain-an-email", "explore-values", "find-references",
      "ground-names", "lanes-and-ports", "meaning-terms", "near-misses", "pick-the-run",
      "quality-and-review", "recommend-action", "settle-the-case", "time-questions",
    ]);
    for (const skill of all.values()) {
      expect(skill.version).toBeGreaterThanOrEqual(1);
      expect(skill.when.length).toBeGreaterThan(20);
      expect(skill.body.split("\n").length).toBeLessThanOrEqual(70);
    }
  });

  it("every recipe belongs to a skill that exists, and every recipe a skill names exists", () => {
    for (const recipe of recipes.values()) expect(all.has(recipe.skill)).toBe(true);
    // parseSkill throws on a recipe that does not exist; loading them all is the check.
    expect(() => parseSkill("---\nname: x\nversion: 1\nwhen: A question that needs a thing.\n---\nCall `no_such_recipe(...)`.", "x", "x/SKILL.md", recipes)).toThrow(/does not exist/);
  });

  it("only names tools that exist", () => {
    const tools = new Set<string>(TOOL_NAMES);
    const recipeNames = new Set(recipes.keys());
    for (const skill of all.values()) {
      for (const match of skill.body.matchAll(/`([a-z]+_[a-z_]+)`/g)) {
        const word = match[1];
        // Column and field names are written the same way; a tool is one of the words that look like a call.
        if (["find_entity", "list_entities", "get_entity", "search_emails", "profile_column", "load_skill", "run_sql", "run_recipe", "describe_schema", "get_email", "explain_decision"].includes(word)) {
          expect(tools.has(word) || recipeNames.has(word)).toBe(true);
        }
      }
    }
  });

  it("show a card for each and bring their recipes' signatures when read in full", () => {
    const cards = skillCards(all);
    expect(cards).toContain("- ground-names: The question names a company");
    expect(cards).toContain("recipes: emails_by_sender_domain, emails_for_entities");
    expect(skillText(all.get("lanes-and-ports")!)).toContain("- lanes(run_id uuid) ->");
  });
});

describe("what the chat is told describes the schema, not the dataset", () => {
  // Everything the agent is shown that a person wrote. What exists in the inbox is the orientation's to report.
  const written = [
    { name: "CHAT.md", text: standing().instructions },
    { name: "chat v2", text: loadPrompt("chat", "v2").text },
    ...[...loadSkills().values()].map((skill) => ({ name: `skill ${skill.name}`, text: `${skill.when}\n${skill.body}` })),
    ...[...loadRecipes().values()].map((recipe) => ({ name: `recipe ${recipe.name}`, text: `${recipe.about}\n${recipe.sql}` })),
  ];
  const fromTheInbox = [
    "aprilasia", "april.com", "fujito", "psabdp", "algurg", "safqa", "roxcel", "ifpla", "vitalsolutions",
    "webmail-verify", "secure-mailbox", "parcel-track", "logistics-deals", "prize-claims", "crypto-invest",
    "TO CONFIRM DOCS", "REQUEST BL DRAFT", "REQUEST SI", "SI NEEDED", "CUST SI", "LOCAL CHARGES", "RAK BILLING",
    "MISSING GR", "UPDATE SUMMARY", "_RPA_", "Mitchelle", "PaperOne",
    "APRIL F", "NOVAKOPA", "MOORIM", "TOPKOPY", "NAGAPPA", "KPP-ANTALIS", "EAST BRIGHT", "PACIFIC OFFICE",
    "NANTONG", "NHAVA SHEVA", "PORT KLANG", "BUATAN", "MOMBASA", "KARACHI", "CALLAO", "MERSIN", "CONAKRY", "JAKARTA",
    "MSC", "OOCL", "EVERGREEN", "HAPAG", "LE HAVRE", "INDO SUKSES", "AFEMY", "AFPTME", "AFRT",
  ];
  it.each(written)("$name names nothing from the inbox", ({ text }) => {
    for (const phrase of fromTheInbox) expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
  });

  it("the chat prompt has a place for the schema, runs sonnet, and caps nothing", () => {
    const prompt = loadPrompt("chat", "v2");
    expect(prompt.text).toContain("{{schema}}");
    expect(prompt.model).toBe("sonnet");
    expect(prompt.maxTokens).toBeUndefined();
  });

  it("the standing text the guard reads carries the enums, so a status is never refused as a guess", () => {
    const text = standingText();
    for (const value of ["MISMATCH", "NEEDS_REVIEW", "BL_COMPARISON", "notify_party", "missing_value"]) expect(text).toContain(value);
  });
});
