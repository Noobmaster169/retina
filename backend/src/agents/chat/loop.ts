import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import type { ChatGraph, ChatToolCall, ChatToolName } from "../../contracts";
import { config } from "../../config";
import { childLogger } from "../../lib/logger";
import { loadPrompt } from "../prompts/registry";
import { callStructured, type StructuredDeps } from "../structured";
import { buildGraph, type TouchedCall } from "./graph";
import { callTool, toolDescriptions, TOOL_NAMES, type ToolContext } from "./tools";

const log = childLogger({ module: "chat.loop" });

const SCHEMA_DOCS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "schema-docs.md"), "utf8");

/**
 * The agent's turn: read the question, call tools until it can answer, answer.
 *
 * Tool use is a JSON protocol rather than a provider's tool-call API, because
 * every call goes through the proxy to `claude -p` and the wire between them
 * carries text. One step per model call, each step either a tool or the final
 * answer, each one a row in `llm_calls`.
 */

/** Eight is two or three queries, a schema lookup when one is wrong, and room to recover from a typo. */
const MAX_STEPS = 8;

const Step = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("tool"),
    tool: z.enum(TOOL_NAMES as [ChatToolName, ...ChatToolName[]]),
    args: z.record(z.string(), z.unknown()),
    /** One sentence, shown to the reader beside the call. */
    thought: z.string().max(400),
  }),
  z.object({
    action: z.literal("final"),
    answer: z.string(),
    sql_used: z.array(z.string()).default([]),
  }),
]);

export interface TurnInput {
  question: string;
  /** Oldest first, already rendered: what the person asked and what the agent answered before now. */
  history: string[];
  scope: { runId: string | null; emailId: string | null };
}

export interface TurnResult {
  answer: string;
  sqlUsed: string[];
  toolCalls: ChatToolCall[];
  graph: ChatGraph;
  /** True when the step budget ran out: the answer is what it had, and the page says so. */
  exhausted: boolean;
}

export interface LoopDeps extends StructuredDeps {
  tools: ToolContext;
}

/** What the model is told about the scope it was opened in. A default it may widen, never a filter it cannot see past. */
function scopeText(scope: TurnInput["scope"]): string {
  const parts = [
    scope.runId ? `run ${scope.runId}` : "no particular run",
    scope.emailId ? `the email ${scope.emailId}` : null,
  ].filter((part): part is string => part !== null);
  return `This conversation was opened about ${parts.join(", and ")}. Use it where the question does not say otherwise, and go wider when the question asks something wider.`;
}

/** Drops what only the graph needed, so the wire carries the contract and nothing more. */
function forWire(call: TouchedCall): ChatToolCall {
  const { touched: _touched, entities: _entities, ...rest } = call;
  return rest;
}

/** What one finished tool call looks like to the model on the next step. */
function transcribe(name: string, thought: string, outcome: { ok: boolean; text: string }): string {
  return `### you called ${name}\nwhy: ${thought}\nresult${outcome.ok ? "" : " (it did not work)"}:\n${outcome.text}`;
}

export async function runTurn(deps: LoopDeps, input: TurnInput): Promise<TurnResult> {
  const prompt = loadPrompt("chat", "v1", config.LLM_MODEL_CHAT);
  const toolCalls: TouchedCall[] = [];
  const sqlUsed: string[] = [];
  const transcript: string[] = [];

  for (let step = 1; step <= MAX_STEPS; step++) {
    const { value } = await callStructured(deps, {
      prompt,
      input: {
        "The schema you may query": SCHEMA_DOCS,
        "The tools you have": toolDescriptions(),
        "The scope of this conversation": scopeText(input.scope),
        "The conversation so far": input.history.length > 0 ? input.history : "(this is the first question)",
        "What you have done on this turn": transcript.length > 0 ? transcript : "(nothing yet)",
        "The question": input.question,
      },
      schema: Step,
      project: "chat",
      // A conversation's tokens are not a run's cost, even when the
      // conversation is about one. See NewLlmCall.runId.
      runId: null,
    });

    if (value.action === "final") {
      return {
        answer: value.answer,
        // What the tools actually ran beats what the model remembers running.
        sqlUsed: sqlUsed.length > 0 ? sqlUsed : value.sql_used,
        toolCalls: toolCalls.map(forWire),
        graph: buildGraph(input.question, toolCalls),
        exhausted: false,
      };
    }

    const started = Date.now();
    const outcome = await callTool(value.tool, value.args, deps.tools);
    const durationMs = Date.now() - started;

    if (outcome.sql) sqlUsed.push(outcome.sql);
    toolCalls.push({
      tool: value.tool,
      args: value.args,
      thought: value.thought,
      ok: outcome.ok,
      preview: outcome.preview,
      sql: outcome.sql ?? null,
      result: outcome.result ?? null,
      durationMs,
      // Carried on the call so the graph is built from what the tools
      // reported, never from what the frontend guesses the answer touched.
      touched: outcome.touched,
      entities: outcome.entities,
    });
    transcript.push(transcribe(value.tool, value.thought, outcome));
    log.info({ step, tool: value.tool, ok: outcome.ok, durationMs }, "chat tool call");
  }

  // The budget is spent. Saying so with what was found beats a made-up answer,
  // and beats an error: the tool results are on the page either way.
  log.warn({ steps: MAX_STEPS, question: input.question.slice(0, 120) }, "the chat loop ran out of steps");
  return {
    answer:
      `I could not finish this within ${MAX_STEPS} steps. What I found is under "Tools used": ` +
      `${toolCalls.map((call) => `${call.tool} (${call.preview})`).join(", ")}. ` +
      "Ask it again more narrowly, or name the run you mean.",
    sqlUsed,
    toolCalls: toolCalls.map(forWire),
    graph: buildGraph(input.question, toolCalls),
    exhausted: true,
  };
}
