import { writeFile } from "node:fs/promises";

import { childLogger } from "../lib/logger";
import { loadGroundTruth, splitPath } from "./ground-truth";
import { splitIds } from "./split";

const log = childLogger({ module: "eval:split" });
const SEED = 42;

// Run once and commit the result. Regenerating it moves emails between train
// and holdout, which makes every earlier holdout score incomparable.
const split = splitIds(await loadGroundTruth(), SEED);
await writeFile(splitPath(), `${JSON.stringify(split, null, 2)}\n`);
log.info({ train: split.train.length, holdout: split.holdout.length, path: splitPath() }, "split written");
