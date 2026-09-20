import type { ChatGraph, ChatToolCall } from "../../contracts";
import { config } from "../../config";
import { childLogger } from "../../lib/logger";
import { loadPrompt } from "../prompts/registry";
import { callStructured, type StructuredDeps } from "../structured";
import { buildGraph } from "./graph";
import { type How, skillsToInject } from "./inject";
import { finish, type FinishedCall, forWire, Step, transcribe } from "./loop.steps";
import { skills, skillText, skillVersions } from "./skills/registry";
import { standing, standingText } from "./standing";
import { callTool, toolDescriptions, type ToolContext } from "./tools";

const log = childLogger({ module: "chat.loop" });

/**
 * The agent's turn: read the question, look, answer.
 *
 * Tool use is a JSON protocol rather than a provider's tool-call API, because
 * every call goes through the proxy to `claude -p` and the wire between them
 * carries text. One step per model call, each step either up to four tool
 * calls run together or the final answer, each one a row in `llm_calls`.
 *
 * The harness around it is what keeps a session from starting blind: the
 * standing instructions, the orientation, the skills it injects on what it can
 * see, and the literal guard inside the tools.
 */

/** Two or three steps answer most questions; the rest is room to recover from a refusal. Never tuned upward without a measurement. */
const MAX_STEPS = 8;
const CHAT_PROMPT = "v2";

export interface TurnInput {
  question: string;
  /** Oldest first: what the person asked and what the agent answered before now. */
  history: { role: "user" | "assistant"; content: string }[];
  scope: { runId: string | null; emailId: string | null };
  /** What the database holds right now, rendered. See orientation.ts. */
  orientation: string;
  /** ISO date. The prompt files never hold it. */
  today: string;
  /** Skills loaded or picked earlier in this conversation. */
  stickySkills: string[];
  /** Skills the person picked for this message. */
  pickedSkills: string[];
}

export interface TurnResult {
  answer: string;
  /** One sentence on how the question was read, from the first step. */
  reading: string;
  sqlUsed: string[];
  toolCalls: ChatToolCall[];
  graph: ChatGraph;
  skillsUsed: { name: string; version: number; how: How }[];
  /** True when the turn needed SQL the agent wrote itself: a question no recipe covers yet. */
  adhoc: boolean;
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

function historyText(history: TurnInput["history"]): string[] {
  return history.map((turn) => `${turn.role === "user" ? "they asked" : "you answered"}: ${turn.content}`);
}

export async function runTurn(deps: LoopDeps, input: TurnInput): Promise<TurnResult> {
  const prompt = loadPrompt("chat", CHAT_PROMPT, config.LLM_MODEL_CHAT);
  const held = standing();
  const known = new Set(skills().keys());
  const calls: FinishedCall[] = [];
  const used = new Map<string, How>();
  /** Things the model is told about its own steps that are not tool calls, so they never reach the page as one. */
  const notes: string[] = [];
  let reading = "";

  // What the agent has been shown that is not a tool result. The person's own
  // words are left out on purpose: a name that appears only there is a guess.
  const shownBefore = [
    standingText(held),
    input.orientation,
    scopeText(input.scope),
    ...input.history.filter((turn) => turn.role === "assistant").map((turn) => turn.content),
  ].join("\n\n");

  const result = (answer: string, sqlFromModel: string[], exhausted: boolean): TurnResult => {
    const sqlUsed = calls.flatMap((call) => (call.sql ? [call.sql] : []));
    return {
      answer,
      reading,
      // What the tools actually ran beats what the model remembers running.
      sqlUsed: sqlUsed.length > 0 ? sqlUsed : sqlFromModel,
      toolCalls: calls.map(forWire),
      graph: buildGraph(input.question, calls),
      skillsUsed: skillVersions([...used.keys()]).map((skill) => ({ ...skill, how: used.get(skill.name) ?? "injected" })),
      adhoc: calls.some((call) => call.tool === "run_sql" && call.ok),
      exhausted,
    };
  };

  for (let step = 1; step <= MAX_STEPS; step++) {
    const injected = skillsToInject(
      {
        scope: input.scope,
        guardRefused: calls.some((call) => call.guardRefused),
        cameUpEmpty: calls.some((call) => call.cameUpEmpty),
        loaded: calls.flatMap((call) => (call.skill ? [call.skill] : [])),
        sticky: input.stickySkills,
        picked: input.pickedSkills,
      },
      known,
    );
    for (const skill of injected) if (!used.has(skill.name)) used.set(skill.name, skill.how);
    const skillBodies = injected.flatMap((item) => {
      const skill = skills().get(item.name);
      return skill ? [skillText(skill)] : [];
    });

    const { value } = await callStructured(deps, {
      prompt,
      input: {
        "Standing instructions": held.instructions,
        "Orientation: what the database holds right now": input.orientation,
        "The skills, and the recipes each brings": held.skillCards,
        "Skills for this turn": skillBodies.length > 0 ? skillBodies.join("\n\n") : "(none injected; load one if a card matches)",
        "Every recipe, as run_recipe takes it": held.recipeSignatures,
        "The schema you may query": held.schemaDocs,
        "The tools you have": toolDescriptions(),
        "The scope of this conversation": `${scopeText(input.scope)} Today is ${input.today}.`,
        "The conversation so far": input.history.length > 0 ? historyText(input.history) : "(this is the first question)",
        "What you have done on this turn": calls.length + notes.length > 0 ? [...calls.map(transcribe), ...notes] : "(nothing yet)",
        "The question": input.question,
      },
      schema: Step,
      project: "chat",
      // A conversation's tokens are not a run's cost, even when the
      // conversation is about one. See NewLlmCall.runId.
      runId: null,
    });

    if (step === 1 || reading === "") reading = value.reading || reading;
    if (value.action === "final" && value.answer.trim() !== "") return result(value.answer, value.sql_used, false);
    if (value.action === "final") {
      notes.push("### you gave a final step with no answer\nWrite the answer in `answer`, or make the calls you still need.");
      log.warn({ step }, "a chat step was final and said nothing");
      continue;
    }

    // A tool step that carries no call is the one shape the flat schema lets
    // through and a union would not have. Handing the mistake back is the same
    // thing the loop does with a bad query or bad arguments.
    if (value.calls.length === 0) {
      notes.push("### you asked for a tool step and gave no calls\nPut one to four calls in `calls`, or answer with action: final.");
      log.warn({ step }, "a chat step asked for tools without naming any");
      continue;
    }

    const shown = [shownBefore, ...skillBodies, ...calls.map((call) => call.text)].join("\n\n");
    const finished = await Promise.all(
      value.calls.map(async (call) => {
        const started = Date.now();
        const outcome = await callTool(call.tool, call.args, { ...deps.tools, shown });
        return finish(call, outcome, Date.now() - started);
      }),
    );
    for (const call of finished) {
      if (call.skill && !used.has(call.skill)) used.set(call.skill, "loaded");
      log.info({ step, tool: call.tool, ok: call.ok, durationMs: call.durationMs }, "chat tool call");
    }
    calls.push(...finished);
  }

  // The budget is spent. Saying so with what was found beats a made-up answer,
  // and beats an error: the tool results are on the page either way.
  log.warn({ steps: MAX_STEPS, question: input.question.slice(0, 120) }, "the chat loop ran out of steps");
  return result(
    `I could not finish this within ${MAX_STEPS} steps. What I found is under "Tools used": ` +
      `${calls.map((call) => `${call.tool} (${call.preview})`).join(", ")}. ` +
      "Ask it again more narrowly, or name the run you mean.",
    [],
    true,
  );
}
