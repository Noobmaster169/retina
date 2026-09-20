import type { ChatToolName } from "../../../contracts";
import { describeSchema } from "./describe-schema";
import { explainDecision } from "./explain-decision";
import { getEmail } from "./get-email";
import { runSql } from "./run-sql";
import type { ChatTool, ToolContext, ToolOutcome } from "./types";

export { refused } from "./types";
export type { ChatTool, ToolContext, ToolOutcome } from "./types";
export { relationsIn } from "./run-sql";

/**
 * The four tools, and the one place they are named.
 *
 * `src/mcp.ts` serves this same object over stdio rather than declaring its
 * own, so a teammate in Claude Code and the chat page are running identical
 * code against identical guardrails. A second definition would be a second set
 * of rules nobody remembers to keep level.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each tool has its own input type; the registry is keyed by name and the loop parses through the tool's own schema.
export const TOOLS: Record<ChatToolName, ChatTool<any>> = {
  describe_schema: describeSchema,
  run_sql: runSql,
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
  return tool.run(parsed.data, ctx);
}
