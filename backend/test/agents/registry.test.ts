import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import { completePromptSet, pinPromptSet, promptFor } from "../../src/agents/prompts/prompt-set";
import { latestVersion, loadPrompt } from "../../src/agents/prompts/registry";
import { TerminalError } from "../../src/lib/errors";

// An experiment's env override for the verifier only, so both sides of the rule show in one file.
vi.mock("../../src/config", async (original) => {
  const actual = await original<typeof import("../../src/config")>();
  return { config: { ...actual.config, LLM_MODEL_CLASSIFY: undefined, LLM_MODEL_VERIFY: "opus" } };
});

const dir = mkdtempSync(join(tmpdir(), "retina-prompts-"));
const file = (step: string, name: string, text: string) => {
  mkdirSync(join(dir, step), { recursive: true });
  writeFileSync(join(dir, step, name), text);
};
const prompt = (step: string, version: string, body: string) =>
  `---\nstep: ${step}\nversion: ${version}\nmodel: sonnet\nmax_tokens: 300\n---\n${body}\n`;

file("demo", "v1.md", prompt("demo", "v1", "First."));
file("demo", "v2.md", prompt("demo", "v2", "Second.\n{{schema}}"));
file("demo", "v10.md", prompt("demo", "v10", "Tenth."));
file("demo", "notes.md", "not a prompt");
file("uncapped", "v1.md", "---\nstep: uncapped\nversion: v1\nmodel: sonnet\n---\nNo cap.");
file("mislabelled", "v1.md", prompt("other", "v1", "Wrong step."));
file("misversioned", "v2.md", prompt("misversioned", "v1", "Wrong version."));
file("broken", "v1.md", "no frontmatter here");
file("badmeta", "v1.md", "---\nstep: badmeta\nversion: one\nmodel: sonnet\nmax_tokens: 300\n---\nBody.");
file("shots", "v1.md", prompt("shots", "v1", "Examples:\n{{examples}}"));
file("shots", "examples.v1.json", JSON.stringify([{ category: "SPAM", email: "Win a prize" }]));
file("shots", "v2.md", prompt("shots", "v2", "Examples:\n{{examples}}"));
file("shots", "v3.md", prompt("shots", "v3", "Examples:\n{{examples}}"));
file("shots", "examples.v3.json", "[{ not json");
file("classify", "v1.md", prompt("classify", "v1", "Classify one."));
file("classify", "v2.md", prompt("classify", "v2", "Classify two."));
file("classify", "v3.md", prompt("classify", "v3", "Classify three."));
file("classify-verify", "v1.md", prompt("classify-verify", "v1", "Verify one."));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("latestVersion", () => {
  it("is the highest version on disk, numerically, ignoring other files", () => {
    expect(latestVersion("demo", dir)).toBe("v10");
  });

  it("refuses a step with no prompts", () => {
    expect(() => latestVersion("nowhere", dir)).toThrow(TerminalError);
  });
});

describe("loadPrompt", () => {
  it("loads exactly the version asked for, not the newest", () => {
    expect(loadPrompt("demo", "v1", undefined, dir)).toEqual({
      step: "demo",
      version: "v1",
      model: "sonnet",
      maxTokens: 300,
      text: "First.",
    });
  });

  it("leaves the token cap to the client when the file names none", () => {
    expect(loadPrompt("uncapped", "v1", undefined, dir).maxTokens).toBeUndefined();
  });

  it("lets a run or an experiment replace the model", () => {
    expect(loadPrompt("demo", "v2", "haiku", dir).model).toBe("haiku");
  });

  it("fills {{examples}} from the version's own examples file", () => {
    expect(loadPrompt("shots", "v1", undefined, dir).text).toBe('Examples:\n<example category="SPAM">\nWin a prize\n</example>');
  });

  it.each([
    ["a version that is not on disk", "demo", "v7"],
    ["a version that is not vN", "demo", "latest"],
    ["a file filed under the wrong step", "mislabelled", "v1"],
    ["a file whose frontmatter names another version", "misversioned", "v2"],
    ["a file with no frontmatter", "broken", "v1"],
    ["frontmatter with a bad version", "badmeta", "v1"],
    ["a prompt that reads examples it does not have", "shots", "v2"],
    ["an examples file that is not JSON", "shots", "v3"],
  ])("refuses %s", (_name, step, version) => {
    expect(() => loadPrompt(step, version, undefined, dir)).toThrow(TerminalError);
  });
});

describe("pinPromptSet", () => {
  it("takes the run's version first, then the active row, then the newest on disk", () => {
    expect(pinPromptSet({ promptSet: { classify: "v1" } }, { classify: "v2" }, dir).classify?.version).toBe("v1");
    expect(pinPromptSet({}, { classify: "v2" }, dir).classify?.version).toBe("v2");
    expect(pinPromptSet({}, {}, dir).classify?.version).toBe("v3");
  });

  it("takes the run's model first, then the env's, then the file's", () => {
    expect(pinPromptSet({ models: { "classify-verify": "haiku" } }, {}, dir)["classify-verify"]?.model).toBe("haiku");
    expect(pinPromptSet({}, {}, dir)["classify-verify"]?.model).toBe("opus");
    expect(pinPromptSet({}, {}, dir).classify?.model).toBe("sonnet");
  });

  it("pins every step, so a prompt added later cannot change the run", () => {
    expect(pinPromptSet({}, {}, dir)).toEqual({
      classify: { version: "v3", model: "sonnet" },
      "classify-verify": { version: "v1", model: "opus" },
    });
  });

  it("refuses a version that does not exist before any email is queued", () => {
    expect(() => pinPromptSet({ promptSet: { classify: "v9" } }, {}, dir)).toThrow(TerminalError);
    expect(() => pinPromptSet({}, { classify: "v9" }, dir)).toThrow(TerminalError);
  });
});

describe("promptFor", () => {
  it("loads what the run pinned", () => {
    const prompt = promptFor("classify", { classify: { version: "v1", model: "haiku" } }, dir);
    expect(prompt).toMatchObject({ version: "v1", model: "haiku", text: "Classify one." });
  });

  it("refuses a step the run did not pin, rather than guess the newest file", () => {
    expect(() => promptFor("classify", {}, dir)).toThrow(TerminalError);
  });
});

describe("completePromptSet", () => {
  it("gives a run from before pinning the active versions, not the newest file", () => {
    // v3 is the newest file here; the active row names v2, and v2 is what the run must get.
    expect(completePromptSet({}, { classify: "v2", "classify-verify": "v1" }, dir)).toEqual({
      classify: { version: "v2", model: "sonnet" },
      "classify-verify": { version: "v1", model: "opus" },
    });
  });

  it("keeps whatever the run did pin", () => {
    const pinned = { classify: { version: "v1", model: "haiku" } };
    expect(completePromptSet(pinned, { classify: "v2" }, dir).classify).toEqual({ version: "v1", model: "haiku" });
  });

  it("leaves a fully pinned set alone", () => {
    const full = { classify: { version: "v1", model: "haiku" }, "classify-verify": { version: "v1", model: "haiku" } };
    expect(completePromptSet(full, {}, dir)).toBe(full);
  });
});

describe("the prompts that ship", () => {
  // The versions migration 004 makes active. v4's examples are inbox emails on purpose, so its own words are checked apart.
  const shipped = [loadPrompt("classify", "v3"), loadPrompt("classify-verify", "v1")];
  const v4Instructions = { ...loadPrompt("classify", "v4"), text: loadPrompt("classify", "v4").text.split("<example")[0] };

  it.each(shipped)("$step $version has a place for the schema and no cap of its own", (prompt) => {
    expect(prompt.text).toContain("{{schema}}");
    expect(prompt.maxTokens).toBeUndefined();
  });

  it.each(shipped)("$step $version defines all five of the organisers' categories", (prompt) => {
    for (const category of ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]) {
      expect(prompt.text).toContain(`- ${category}:`);
    }
  });

  it("v4 reads ten examples, two of each category", () => {
    const text = loadPrompt("classify", "v4").text;
    for (const category of ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]) {
      expect(text.split(`<example category="${category}">`)).toHaveLength(3);
    }
  });

  it("the classifier runs sonnet", () => {
    expect(shipped[0].model).toBe("sonnet");
  });

  it.each([...shipped, v4Instructions])("$step $version describes the task, not the dataset: no sender, domain or subject code from the inbox", (prompt) => {
    const fromTheInbox = [
      "aprilasia", "april.com", "fujito", "psabdp", "algurg", "safqa", "roxcel", "ifpla", "vitalsolutions",
      "webmail-verify", "secure-mailbox", "parcel-track", "logistics-deals", "prize-claims", "crypto-invest",
      "TO CONFIRM DOCS", "REQUEST BL DRAFT", "REQUEST SI", "SI NEEDED", "CUST SI", "LOCAL CHARGES", "RAK BILLING",
      "MISSING GR", "UPDATE SUMMARY", "_RPA_", "Mitchelle", "PaperOne",
    ];
    for (const phrase of fromTheInbox) expect(prompt.text.toLowerCase()).not.toContain(phrase.toLowerCase());
  });
});
