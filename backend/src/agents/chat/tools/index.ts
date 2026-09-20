import type { ChatToolName } from "../../../contracts";
import { childLogger } from "../../../lib/logger";
import { describeSchema } from "./describe-schema";
import { explainDecision } from "./explain-decision";
import { findEntity } from "./find-entity";
import { getEmail } from "./get-email";
import { getEntity } from "./get-entity";
import { listEntities } from "./list-entities";
import { loadSkill } from "./load-skill";
import { profileColumn } from "./profile-column";
import { runRecipe } from "./run-recipe";
import { runSql } from "./run-sql";
import { searchEmails } from "./search-emails";
import { type ChatTool, refused, type ToolContext, type ToolOutcome } from "./types";

const log = childLogger({ module: "chat.tools" });

export { refused };
export type { ChatTool, ToolContext, ToolOutcome } from "./types";
export { relationsIn } from "./run-sql";

/**
 * The tools, and the one place they are named, in the order the agent should
 * reach for them: the standard query, the ways of looking, then its own SQL.
 *
 * `src/mcp.ts` serves this same object over stdio rather than declaring its
 * own, so a teammate in Claude Code and the chat page are running identical
 * code against identical guardrails. A second definition would be a second set
 * of rules nobody remembers to keep level.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each tool has its own input type; the registry is keyed by name and the loop parses through the tool's own schema.
export const TOOLS: Record<ChatToolName, ChatTool<any>> = {
  run_recipe: runRecipe,
  find_entity: findEntity,
  list_entities: listEntities,
  get_entity: getEntity,
  search_emails: searchEmails,
  profile_column: profileColumn,
  load_skill: loadSkill,
  run_sql: runSql,
  describe_schema: describeSchema,
  get_email: getEmail,
  explain_decision: explainDecision,
};

export const TOOL_NAMES = Object.keys(TOOLS) as ChatToolName[];

/** The tool list as the prompt shows it: one line each, in the order they are usually reached for. */
export function toolDescriptions(): string {
  return TOOL_NAMES.map((name) => `- ${name}: ${TOOLS[name].description}`).join("\n");
}

/**
 * Parses the arguments through the tool's own schema and runs it.
 *
 * A validation failure comes back as a refused outcome rather than a throw,
 * because the loop's answer to bad arguments is to hand the model the reason
 * and let it try again, which is the same thing it does with a bad query.
 */
export async function callTool(name: ChatToolName, args: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const tool = TOOLS[name];
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return {
      ok: false,
      text: `Those arguments do not fit ${name}: ${problems.join("; ")}`,
      preview: `bad arguments: ${problems[0]}`,
      touched: [{ relation: "nothing", count: 0 }],
      entities: [],
    };
  }
  try {
    return await tool.run(parsed.data, ctx);
  } catch (error) {
    // A tool that throws (a query the role may not run, a timeout) must not take
    // the turn with it: the agent is told, can try another way, and the page
    // shows the failed call. Logged, because it is ours to fix and not the model's.
    const reason = error instanceof Error ? error.message : String(error);
    log.warn({ tool: name, err: reason }, "a chat tool failed");
    return refused(`${name} failed: ${reason}`);
  }
}
