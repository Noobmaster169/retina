import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { callTool, TOOL_NAMES, TOOLS, type ToolContext } from "./agents/chat/tools";
import { closePool, closeRoPool, getPool, getRoPool } from "./db";

/**
 * The chat's tools, over stdio, for a teammate working in Claude Code.
 *
 * It serves the same `TOOLS` registry the chat page does rather than declaring
 * its own, so the guardrail, the row caps and the read-only role are identical
 * on both. A second definition here would be a second set of rules that nobody
 * would remember to keep level with the first.
 *
 * Run from `.mcp.json` at the repository root, which passes the same .env this
 * backend reads. Nothing about it is a service: there is no port, no process
 * to supervise, and it exits when the client closes the pipe.
 */

const server = new McpServer({ name: "retina", version: "0.1.0" });

const context: ToolContext = {
  pool: getPool(),
  roPool: getRoPool(),
  // No conversation, so no scope, and no `shown`: a person wrote the SQL, so the
  // literal guard stands down. The write guard and the read-only role do not.
  // No conversation, so no scope. A question asked here names its own run, and
  // a tool that wants the latest one looks it up the same way it would.
  runId: null,
  emailId: null,
};

for (const name of TOOL_NAMES) {
  const tool = TOOLS[name];
  server.registerTool(
    name,
    { description: tool.description, inputSchema: tool.shape },
    async (args: unknown) => {
      const outcome = await callTool(name, args, context);
      // A refusal is content and not a transport error: the guardrail's reason
      // is the useful part, and an error here would hide it behind a stack.
      return { content: [{ type: "text" as const, text: outcome.text }], isError: !outcome.ok };
    },
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void (async () => {
      await closePool();
      await closeRoPool();
      process.exit(0);
    })();
  });
}
