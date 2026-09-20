import type { Pool } from "pg";
import type { z } from "zod";

import type { ChatToolName, GroundedThing, SemanticReading, SqlResult } from "../../../contracts";
import type { LlmClient } from "../../llm-client";
import type { Queryable } from "../../../db";

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
  roPool: Queryable | null;
  /**
   * For the one tool that makes model calls of its own: `find_entities` defines
   * a term and judges things against it. Absent over MCP, where a person is the
   * agent and there is nothing to spend tokens on their behalf; that tool then
   * says so rather than failing.
   */
  llm?: LlmClient;
  /** The conversation's scope. A default for a question that names no run, never a filter it cannot widen. */
  runId: string | null;
  emailId: string | null;
  /**
   * Everything the harness has put in front of the agent on this turn: the
   * standing texts, the orientation, and every tool result so far. The literal
   * guard reads it. Absent over MCP, where a person writes the SQL and there
   * is no turn; the guard then stands down.
   */
  shown?: string;
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
  /** Set by `run_recipe`: which standard query ran, from which skill, with what. */
  recipe?: { name: string; version: number; skill: string; params: Record<string, unknown> };
  /**
   * What the data returned, and nothing else: result cells, stored names, subjects, snippets.
   * The literal guard reads this, never `text`, because `text` also carries what was asked for
   * (the name looked up, a query's purpose, a refusal quoting the refused string), and a guess
   * that counted as shown once it had been echoed would defeat the guard in one step.
   */
  grounds?: string;
  /** The call looked and found nothing, or nothing exact. The harness injects the skill for that. */
  empty?: boolean;
  /**
   * The call returned candidates of more than one kind, which is the one
   * ambiguity the harness can see for itself. Several candidates of one kind
   * are not this: a short company name matching four companies of one group
   * means all four, and ground-names already says to take them all.
   */
  ambiguous?: boolean;
  /** Set when the literal guard refused the call: the strings it would not filter on. */
  ungrounded?: string[];
  /** Set by `load_skill`: the skill now in front of the agent, which stays there for the conversation. */
  skill?: string;
  /**
   * Set by `find_entities`: the term it gave a meaning to, and how completely.
   *
   * It reaches the turn and the page, because a total over a set that was only
   * partly judged is a lower bound and the reader has to be told so.
   */
  semantic?: SemanticReading[];
  /**
   * The resolved things this call put in front of the agent, for the
   * conversation to remember by name.
   *
   * Names and not ids. A refresh keeps ids since phase 10f, so this is a
   * choice: a name is what the person says on the next turn, and grounding it
   * again is one indexed lookup that follows a merge for free.
   */
  things?: GroundedThing[];
}

export interface ChatTool<I> {
  name: ChatToolName;
  /** One or two sentences. Goes straight into the prompt, so it is written for a model to act on. */
  description: string;
  schema: z.ZodType<I>;
  /**
   * The same schema's fields, which `src/mcp.ts` registers a tool with.
   *
   * Stated rather than reached for off `schema`, because `z.ZodType` has no
   * `shape` and widening the field to `ZodObject` would give up the link
   * between the schema and the input type `run` is handed. One word per tool
   * against a cast at the only place that needs it.
   */
  shape: z.ZodRawShape;
  run(input: I, ctx: ToolContext): Promise<ToolOutcome>;
}

/** A tool that refused, in the shape the loop feeds back so the model can try again. */
export function refused(reason: string, relation = "nothing"): ToolOutcome {
  return { ok: false, text: `The call was refused: ${reason}`, preview: reason, touched: [{ relation, count: 0 }], entities: [] };
}
