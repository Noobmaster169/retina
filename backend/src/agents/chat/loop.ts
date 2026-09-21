import { config } from "../../config";
import { childLogger } from "../../lib/logger";
import { loadPrompt } from "../prompts/registry";
import { callStructured, type StructuredDeps } from "../structured";
import type { How } from "./inject";
import { type Scope, scopeText, stepInput } from "./loop.input";
import { assemble, exhaustedAnswer, type FinalStep, stoppedAnswer, type TurnResult } from "./loop.result";
import { skillsForStep } from "./loop.skills";
import { finish, type FinishedCall, Step } from "./loop.steps";
import { problemWith } from "./next-moves";
import { standing, standingText } from "./standing";
import { callTool, type ToolContext } from "./tools";

export type { TurnResult } from "./loop.result";

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
 * see, and the literal guard inside the tools. What one step is given is
 * `loop.input.ts`; what one step may say is `loop.steps.ts`.
 */

/** Two or three steps answer most questions; the rest is room to recover from a refusal. Never tuned upward without a measurement. */
const MAX_STEPS = 8;
const CHAT_PROMPT = "v5";

export interface TurnInput {
  question: string;
  /** Oldest first: what the person asked and what the agent answered before now. */
  history: { role: "user" | "assistant"; content: string }[];
  scope: Scope;
  /** What the database holds right now, rendered. See orientation.ts. */
  orientation: string;
  /** ISO date. The prompt files never hold it. */
  today: string;
  /** Skills loaded or picked earlier in this conversation. */
  stickySkills: string[];
  /** Skills the person picked for this message. */
  pickedSkills: string[];
  /** What earlier turns grounded, rendered. For the model only: nothing in it grounds a literal. */
  memory: string;
}

export interface LoopDeps extends StructuredDeps {
  tools: ToolContext;
  /**
   * Called with a step's finished calls, before the next model call.
   *
   * A step's calls run together, so this fires once per step with up to four of
   * them rather than once per call. Awaited: the write that makes a step
   * readable must land before the step that follows it, or the page shows them
   * out of order. A failure here is the caller's to handle; the turn does not
   * depend on it.
   */
  onStep?(calls: FinishedCall[]): Promise<void>;
  /**
   * Whether the person has stopped this turn. Read between steps, never inside
   * one: a model call already in flight is left to finish, because abandoning
   * it would leave an `llm_calls` row that no turn accounts for.
   */
  stopped?(): boolean;
}

export async function runTurn(deps: LoopDeps, input: TurnInput): Promise<TurnResult> {
  const prompt = loadPrompt("chat", CHAT_PROMPT, config.LLM_MODEL_CHAT);
  const held = standing();
  const calls: FinishedCall[] = [];
  const used = new Map<string, How>();
  /** Things the model is told about its own steps that are not tool calls, so they never reach the page as one. */
  const notes: string[] = [];
  let reading = "";

  // What the agent has been shown that is not a tool result. The person's own
  // words are left out on purpose, and so are the agent's earlier answers, which
  // repeat them ("nothing for April Paper Trading"). A name it grounded on an
  // earlier turn is a stored spelling, and the guard asks the database for those.
  const shownBefore = [standingText(held), input.orientation, scopeText(input.scope)].join("\n\n");

  /** Whether a final step that broke its own shape has already been handed back. Once is teaching; twice is a loop. */
  let toldOnce = false;
  const result = (final: Partial<FinalStep> & { answer: string }): TurnResult =>
    assemble(
      { question: input.question, calls, used, reading },
      { sqlUsed: [], outcome: "answered", checked: [], next: [], clarify: null, exhausted: false, ...final },
    );

  for (let step = 1; step <= MAX_STEPS; step++) {
    const { injected, bodies: skillBodies } = skillsForStep({
      scope: { ...input.scope, contextKinds: input.scope.context.map((item) => item.ref.kind) },
      guardRefused: calls.some((call) => call.guardRefused),
      cameUpEmpty: calls.some((call) => call.cameUpEmpty),
      ambiguous: calls.some((call) => call.ambiguous),
      gaveMeaning: calls.some((call) => call.semantic.length > 0),
      loaded: calls.flatMap((call) => (call.skill ? [call.skill] : [])),
      sticky: input.stickySkills,
      picked: input.pickedSkills,
    });
    for (const skill of injected) if (!used.has(skill.name)) used.set(skill.name, skill.how);

    const { value } = await callStructured(deps, {
      prompt,
      input: stepInput({
        held,
        orientation: input.orientation,
        scope: input.scope,
        today: input.today,
        history: input.history,
        memory: input.memory,
        skillBodies,
        calls,
        notes,
        question: input.question,
      }),
      schema: Step,
      project: "chat",
      // A conversation's tokens are not a run's cost, even when the
      // conversation is about one. See NewLlmCall.runId.
      runId: null,
    });

    if (step === 1 || reading === "") reading = value.reading || reading;
    if (value.action === "final") {
      if (value.answer.trim() === "") {
        notes.push("### you gave a final step with no answer\nWrite the answer in `answer`, or make the calls you still need.");
        log.warn({ step }, "a chat step was final and said nothing");
        continue;
      }
      // A claim the answer cannot support is worth one correction: the agent
      // knows where it looked and which candidates it found, and saying so is
      // cheaper than a second turn. Twice would be the loop arguing with
      // itself, so the second one is settled in code and stored without it.
      const problem = problemWith(value);
      if (problem !== null && !toldOnce) {
        toldOnce = true;
        notes.push(`### your answer claimed something it did not carry\n${problem}`);
        log.info({ step, outcome: value.outcome }, "a chat final step was handed back");
        continue;
      }
      return result({
        answer: value.answer,
        sqlUsed: value.sql_used,
        outcome: value.outcome,
        checked: value.checked,
        next: value.next,
        clarify: value.clarify,
      });
    }

    // A tool step that carries no call is the one shape the flat schema lets
    // through and a union would not have. Handing the mistake back is the same
    // thing the loop does with a bad query or bad arguments.
    if (value.calls.length === 0) {
      notes.push("### you asked for a tool step and gave no calls\nPut one to four calls in `calls`, or answer with action: final.");
      log.warn({ step }, "a chat step asked for tools without naming any");
      continue;
    }

    // Only what the data returned: a tool's text also echoes what was asked for.
    const shown = [shownBefore, ...skillBodies, ...calls.map((call) => call.grounds)].join("\n\n");
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
    if (deps.onStep) await deps.onStep(finished);

    if (deps.stopped?.()) {
      log.info({ step, calls: calls.length }, "a chat turn was stopped between steps");
      return result({ answer: stoppedAnswer(calls, step), outcome: "partial" });
    }
  }

  // The budget is spent. Saying so with what was found beats a made-up answer,
  // and beats an error: the tool results are on the page either way.
  log.warn({ steps: MAX_STEPS, question: input.question.slice(0, 120) }, "the chat loop ran out of steps");
  return result({ answer: exhaustedAnswer(calls, MAX_STEPS), exhausted: true });
}
