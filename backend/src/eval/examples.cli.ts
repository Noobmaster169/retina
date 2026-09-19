/**
 * pnpm eval:examples
 * Writes src/agents/prompts/classify/examples.v4.json, the few-shot examples
 * that prompt v4 reads. v3 is untouched. v4 ships only if its holdout run beats
 * v3's; if it does not, both files are deleted and the result is recorded in
 * docs/PROGRESS.md so nobody repeats the experiment blind.
 */
import { writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getEmail } from "../emails";
import { childLogger } from "../lib/logger";
import { chooseExampleIds, toExample } from "./examples";
import { loadGroundTruth } from "./ground-truth";
import { loadSplit, subsetIds } from "./id-lists";

const log = childLogger({ module: "eval:examples" });
const SEED = 11;
const PER_CATEGORY = 2;
const MAX_BODY_CHARS = 1500;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "agents", "prompts", "classify", "examples.v4.json");

const [truth, split, devIds] = await Promise.all([loadGroundTruth(), loadSplit(), subsetIds("dev")]);
const ids = chooseExampleIds(truth, split, devIds, PER_CATEGORY, SEED);
const examples = [];
for (const id of ids) {
  const email = await getEmail(id);
  examples.push(toExample(truth[id].category, { ...email, attachments: email.attachments.map((path) => basename(path)) }, MAX_BODY_CHARS));
}
await writeFile(OUT, `${JSON.stringify(examples, null, 2)}\n`);
log.info({ ids, path: OUT }, "few-shot examples written");
