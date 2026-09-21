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
file("reader", "v1.md", "---\nstep: reader\nversion: v1\nmodel: sonnet\nreads_attachments: true\n---\nReads files.");
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
file("triage", "v1.md", prompt("triage", "v1", "Triage one."));
file("doc-type", "v1.md", prompt("doc-type", "v1", "Type one."));
file("extract", "v1.md", prompt("extract", "v1", "Extract one."));
file("extract-verify", "v1.md", prompt("extract-verify", "v1", "Verify extraction one."));
file("field-judge", "v1.md", prompt("field-judge", "v1", "Judge one."));
file("vision-read", "v1.md", prompt("vision-read", "v1", "Look at one."));

const PHASE_5_AND_6 = {
  triage: { version: "v1", model: "sonnet" },
  "doc-type": { version: "v1", model: "sonnet" },
  extract: { version: "v1", model: "sonnet" },
  "extract-verify": { version: "v1", model: "sonnet" },
  "field-judge": { version: "v1", model: "sonnet" },
  "vision-read": { version: "v1", model: "sonnet" },
};

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
      readsAttachments: false,
      text: "First.",
    });
  });

  it("leaves the token cap to the client when the file names none", () => {
    expect(loadPrompt("uncapped", "v1", undefined, dir).maxTokens).toBeUndefined();
  });

  it("reads attachments only when the file says so", () => {
    expect(loadPrompt("uncapped", "v1", undefined, dir).readsAttachments).toBe(false);
    expect(loadPrompt("reader", "v1", undefined, dir).readsAttachments).toBe(true);
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
      ...PHASE_5_AND_6,
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
      ...PHASE_5_AND_6,
    });
  });

  it("keeps whatever the run did pin", () => {
    const pinned = { classify: { version: "v1", model: "haiku" } };
    expect(completePromptSet(pinned, { classify: "v2" }, dir).classify).toEqual({ version: "v1", model: "haiku" });
  });

  it("leaves a fully pinned set alone", () => {
    const pin = { version: "v1", model: "haiku" };
    const full = { classify: pin, "classify-verify": pin, triage: pin, "doc-type": pin, extract: pin, "extract-verify": pin, "field-judge": pin, "vision-read": pin };
    expect(completePromptSet(full, {}, dir)).toBe(full);
  });
});

describe("the prompts that ship", () => {
  // The classify versions migrations 004 and 005 make active or offer, and the phase 5 steps. v4's examples are inbox emails on purpose, so its own words are checked apart.
  const classifiers = [
    loadPrompt("classify", "v3"),
    loadPrompt("classify-verify", "v1"),
    loadPrompt("classify", "v5"),
    loadPrompt("classify-verify", "v2"),
  ];
  // Both versions of each reader ship: migration 027 made v2 active, and a run created before it
  // pinned v1 and still replays on it. Every one of them is held to the rules below.
  const extractors = [
    loadPrompt("extract", "v1"),
    loadPrompt("extract", "v2"),
    loadPrompt("extract-verify", "v1"),
    loadPrompt("extract-verify", "v2"),
  ];
  const readers = [...extractors, loadPrompt("field-judge", "v1")];
  const shipped = [
    ...classifiers,
    loadPrompt("triage", "v1"),
    loadPrompt("doc-type", "v1"),
    ...readers,
    // Phase 10f's five. None of them is scored and all of them are held to the
    // same rule: describe the task, never the dataset.
    loadPrompt("shipment-read", "v1"),
    loadPrompt("entity-resolve", "v1"),
    loadPrompt("entity-profile", "v1"),
    loadPrompt("concept-define", "v1"),
    loadPrompt("concept-judge", "v1"),
  ];

  it.each(extractors)("$step $version names all seven of the organisers' fields", (prompt) => {
    for (const field of ["shipper", "consignee", "notify_party", "port_of_loading", "port_of_discharge", "container_count", "gross_weight_kg"]) {
      expect(prompt.text).toContain(`- ${field}:`);
    }
  });

  it("the field judge states the two words it answers with, and that an absent value is never a difference", () => {
    const text = loadPrompt("field-judge", "v1").text;
    expect(text).toContain('What "the same" means');
    expect(text).toContain('What "missing" means');
    expect(text).toContain("never a difference");
  });
  const v4Instructions = { ...loadPrompt("classify", "v4"), text: loadPrompt("classify", "v4").text.split("<example")[0] };

  it.each(shipped)("$step $version has a place for the schema and no cap of its own", (prompt) => {
    expect(prompt.text).toContain("{{schema}}");
    expect(prompt.maxTokens).toBeUndefined();
  });

  it.each(classifiers)("$step $version defines all five of the organisers' categories", (prompt) => {
    for (const category of ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]) {
      expect(prompt.text).toContain(`- ${category}:`);
    }
  });

  it("only the phase 5 classify prompts read the attachments' text, and they say how", () => {
    expect(shipped.filter((p) => p.readsAttachments).map((p) => `${p.step} ${p.version}`)).toEqual(["classify v5", "classify-verify v2"]);
    for (const prompt of shipped.filter((p) => p.readsAttachments)) expect(prompt.text).toContain('under "attachment contents"');
  });

  it("the triage prompt states the organisers' two readings of an empty comparison request", () => {
    const text = loadPrompt("triage", "v1").text;
    expect(text).toContain("- send_draft:");
    expect(text).toContain("- compare_documents:");
  });

  it("the doc-type prompt defines every kind the schema allows, and no title table decides", () => {
    const text = loadPrompt("doc-type", "v1").text;
    for (const kind of ["SI", "BL", "INVOICE", "PACKING_LIST", "COO", "OTHER"]) expect(text).toContain(`- ${kind}:`);
  });

  it("v4 reads ten examples, two of each category", () => {
    const text = loadPrompt("classify", "v4").text;
    for (const category of ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]) {
      expect(text.split(`<example category="${category}">`)).toHaveLength(3);
    }
  });

  it.each(shipped)("$step $version runs sonnet", (prompt) => {
    expect(prompt.model).toBe("sonnet");
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
