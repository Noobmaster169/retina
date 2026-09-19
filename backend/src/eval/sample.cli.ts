/**
 * pnpm eval:sample
 * Writes eval/dev-sample.json: six train emails of each category, the subset a
 * change is tried on before the holdout is read. Ids only.
 */
import { writeFile } from "node:fs/promises";

import { childLogger } from "../lib/logger";
import { loadGroundTruth } from "./ground-truth";
import { devSamplePath, loadSplit } from "./id-lists";
import { pickPerCategory } from "./pick";

const log = childLogger({ module: "eval:sample" });
const SEED = 7;
const PER_CATEGORY = 6;

// Run once and commit the result, like the split: a new draw makes earlier dev numbers incomparable.
const [truth, split] = await Promise.all([loadGroundTruth(), loadSplit()]);
const ids = pickPerCategory(truth, split.train, PER_CATEGORY, SEED);
await writeFile(devSamplePath(), `${JSON.stringify({ seed: SEED, ids }, null, 2)}\n`);
log.info({ emails: ids.length, path: devSamplePath() }, "dev sample written");
