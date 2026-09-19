import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { resolvePrompt } from "../../src/agents/prompts/registry";
import { TerminalError } from "../../src/lib/errors";

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
file("broken", "v1.md", "no frontmatter here");
file("badmeta", "v1.md", "---\nstep: badmeta\nversion: one\nmodel: sonnet\nmax_tokens: 300\n---\nBody.");

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("resolvePrompt", () => {
  it("takes the highest version on disk, numerically, and ignores other files", () => {
    expect(resolvePrompt("demo", undefined, dir)).toEqual({
      step: "demo",
      version: "v10",
      model: "sonnet",
      maxTokens: 300,
      text: "Tenth.",
    });
  });

  it("leaves the token cap to the client when the file names none", () => {
    expect(resolvePrompt("uncapped", undefined, dir).maxTokens).toBeUndefined();
  });

  it("ships a classify prompt with no cap of its own", () => {
    expect(resolvePrompt("classify").maxTokens).toBeUndefined();
  });

  it("lets an experiment replace the model", () => {
    expect(resolvePrompt("demo", "haiku", dir).model).toBe("haiku");
  });

  it.each([["an unknown step", "nowhere"], ["a file filed under the wrong step", "mislabelled"], ["a file with no frontmatter", "broken"], ["a version that is not vN", "badmeta"]])(
    "refuses %s",
    (_name, step) => {
      expect(() => resolvePrompt(step, undefined, dir)).toThrow(TerminalError);
    },
  );
});

describe("the classify prompt that ships", () => {
  const shipped = resolvePrompt("classify");

  it("runs sonnet and has a place for the schema", () => {
    expect(shipped.model).toBe("sonnet");
    expect(shipped.text).toContain("{{schema}}");
  });

  it("defines all five of the organisers' categories", () => {
    for (const category of ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]) {
      expect(shipped.text).toContain(`- ${category}:`);
    }
  });

  it("describes the task, not the dataset: no sender, domain or subject code from the inbox", () => {
    const fromTheInbox = [
      "aprilasia", "april.com", "fujito", "psabdp", "algurg", "safqa", "roxcel", "ifpla", "vitalsolutions",
      "webmail-verify", "secure-mailbox", "parcel-track", "logistics-deals", "prize-claims", "crypto-invest",
      "TO CONFIRM DOCS", "REQUEST BL DRAFT", "REQUEST SI", "SI NEEDED", "CUST SI", "LOCAL CHARGES", "RAK BILLING",
      "MISSING GR", "UPDATE SUMMARY", "_RPA_", "Mitchelle", "PaperOne",
    ];
    for (const phrase of fromTheInbox) expect(shipped.text.toLowerCase()).not.toContain(phrase.toLowerCase());
  });
});
