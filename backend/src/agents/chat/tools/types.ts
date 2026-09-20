import type { Pool } from "pg";
import type { z } from "zod";

import type { ChatToolName, SqlResult } from "../../../contracts";

/**
 * What every tool is: a name, a sentence the prompt shows the model, a zod
 * schema for its arguments, and one async function.
 *
 * The seam is narrow on purpose. A tool may read, may report what it read, and
 * may not write: there is no `db` on the context that is not a pool the caller
 * chose, and `roPool` is the only one a model-written query ever reaches.
 */

export interface ToolContext {
  /**
   * The read-write pool, for the two tools that read model rationales.
   * `llm_calls.parsed` is not granted to retina_ro, and the narrative in
   * `explain_decision` is mostly made of rationales, so those queries are
   * fixed text in this repository rather than anything a model composed.
   */
  pool: Pool;
  /** Where model-written SQL runs. Null when DATABASE_RO_URL is unset; the tool says so. */
  roPool: Pool | null;
  /** The conversation's scope. A default for a question that names no run, never a filter it cannot widen. */
  runId: string | null;
  emailId: string | null;
}

/**
 * What a tool hands back.
 *
 * `text` goes to the model and `preview` goes to the page; they are different
 * because a model reads 200 rows of TSV better than prose and a person reads
 * one sentence better than 200 rows. `result` carries the rows themselves for
 * the table the page draws under the answer.
 */
export interface ToolOutcome {
  ok: boolean;
  /** What the loop feeds back as the tool's turn. */
  text: string;
  /** One line for the collapsed `Tools used` block. */
  preview: string;
  sql?: string;
  result?: SqlResult;
  /**
   * What this call actually touched, for the result graph. Reported by the
   * tool from fact rather than inferred in the frontend, which is what
   * docs/design/ontology-patterns.md section 3.6 requires: a relation that
   * returned nothing still appears here with a 0, because showing the dead end
   * is the point.
   */
  touched: { relation: string; count: number }[];
  /** The things the answer is about, for the graph's rightmost column. */
  entities: string[];
}

export interface ChatTool<I> {
  name: ChatToolName;
  /** One or two sentences. Goes straight into the prompt, so it is written for a model to act on. */
  description: string;
  schema: z.ZodType<I>;
  run(input: I, ctx: ToolContext): Promise<ToolOutcome>;
}

/** A tool that refused, in the shape the loop feeds back so the model can try again. */
export function refused(reason: string, relation = "nothing"): ToolOutcome {
  return { ok: false, text: `The call was refused: ${reason}`, preview: reason, touched: [{ relation, count: 0 }], entities: [] };
}
