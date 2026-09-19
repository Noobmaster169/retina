import { describe, expect, it } from "vitest";

import type { TruthRow } from "../../src/contracts";
import { chooseExampleIds, toExample } from "../../src/eval/examples";
import { loadSplit, subsetIds } from "../../src/eval/id-lists";
import { CATEGORIES } from "../../src/eval/score";
import { splitIds } from "../../src/eval/split";
import { TerminalError } from "../../src/lib/errors";

function truth(): Record<string, TruthRow> {
  const out: Record<string, TruthRow> = {};
  let n = 0;
  for (const category of CATEGORIES) {
    for (let i = 0; i < 20; i++) {
      out[`email_${String(++n).padStart(3, "0")}`] = {
        category,
        status: category === "BL_COMPARISON" ? "OK" : null,
        review_reason: null,
        has_defect: false,
        defect_fields: [],
      } as TruthRow;
    }
  }
  return out;
}

describe("chooseExampleIds", () => {
  const all = truth();
  const split = splitIds(all, 42);
  const dev = split.train.slice(0, 10);

  it("never takes a holdout id or a dev-sample id, over many seeds", () => {
    for (let seed = 0; seed < 50; seed++) {
      const ids = chooseExampleIds(all, split, dev, 2, seed);
      expect(ids.filter((id) => split.holdout.includes(id))).toEqual([]);
      expect(ids.filter((id) => dev.includes(id))).toEqual([]);
    }
  });

  it("takes the same few of each category for the same seed", () => {
    const ids = chooseExampleIds(all, split, dev, 2, 11);
    expect(ids).toEqual(chooseExampleIds(all, split, dev, 2, 11));
    for (const category of CATEGORIES) expect(ids.filter((id) => all[id].category === category)).toHaveLength(2);
  });

  it("refuses a split that lists a holdout id in train, rather than leak it", () => {
    const leaky = { ...split, train: [...split.train, ...split.holdout] };
    const tryAllSeeds = () => {
      for (let seed = 0; seed < 50; seed++) chooseExampleIds(all, leaky, [], 20, seed);
    };
    expect(tryAllSeeds).toThrow(TerminalError);
  });
});

describe("toExample", () => {
  it("renders the email in the classifier's own sections, cutting a long body", () => {
    const example = toExample("SPAM", { from: "a@b.c", subject: "Win", attachments: [], body: "x".repeat(20) }, 5);
    expect(example).toEqual({
      category: "SPAM",
      email: "## from\na@b.c\n\n## subject\nWin\n\n## attachments\n(none)\n\n## body\nxxxxx\n[cut]",
    });
  });
});

describe("the committed dev sample", () => {
  it("is drawn from train only, so iterating on it never reads the holdout", async () => {
    const [split, dev] = await Promise.all([loadSplit(), subsetIds("dev")]);
    expect(dev.filter((id) => split.holdout.includes(id))).toEqual([]);
    expect(dev.every((id) => split.train.includes(id))).toBe(true);
  });
});
