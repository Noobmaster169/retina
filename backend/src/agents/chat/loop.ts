import { config } from "../../config";
import type { ChatPhase, ChatProgress } from "../../contracts";
import { childLogger } from "../../lib/logger";
import { loadPrompt } from "../prompts/registry";
import { callStructured, type StructuredDeps } from "../structured";
import type { How } from "./inject";
import { type Scope, scopeText, stepInput } from "./loop.input";
import { assemble, exhaustedAnswer, type FinalStep, stoppedAnswer, type TurnResult } from "./loop.result";
import { skillsForStep } from "./loop.skills";
import { finish, type FinishedCall, Step } from "./loop.steps";
import { problemWith } from "./next-moves";
import { valueSoFar } from "./partial";
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
const CHAT_PROMPT = "v10";

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
  /**
   * Where the turn has got to, called as it gets there.
   *
   * Not awaited, unlike `onStep`: a progress event is a repaint of something
   * that is about to be replaced anyway, so one that arrives late, out of order
   * or not at all costs a frame and never an answer. Awaiting it would put the
   * consumer's speed between the model and the next piece of its own answer.
   */
  onProgress?(progress: ChatProgress): void;
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

  /**
   * What the step in flight has written so far, as the page needs it.
   *
   * The model writes its object in the schema's order, so `action` and
   * `reading` are there long before the answer is, and `action` is what says
   * whether this step will be prose or another look. Only a change the page
   * would draw is reported: most of the deltas in a tool step land inside
   * fields nobody is watching.
   */
  const watch = (step: number) => {
    let last = "";
    // The furthest this step has got, which is not always the latest thing it
    // wrote. `claude -p` sends the whole object a second time in a second
    // content block, so the preview it hands back drops to empty partway
    // through and writes nearly the same answer again. A reader is mid
    // sentence when that happens, and blanking the page and retyping it is the
    // worst way to spend that moment. So the preview only ever moves forward:
    // the text already shown is held until the second pass has caught up, and
    // the answer that finally lands is the validated one either way.
    let shownAnswer = "";
    let shownReading = "";

    return (soFar: string) => {
      const answer = valueSoFar(soFar, "answer");
      const said = valueSoFar(soFar, "reading");
      if (answer.length >= shownAnswer.length) shownAnswer = answer;
      if (said.length >= shownReading.length) shownReading = said;

      // `action` says "final" long before the answer starts, because the model
      // writes the object in order and `reading` sits between them. Phase
      // follows the prose and not the intent, or the page claims to be writing
      // an answer through the whole of the pause before one exists.
      const phase: ChatPhase = shownAnswer !== "" ? "writing" : "reading";
      const signature = [phase, shownReading, shownAnswer].join("\u0000");
      if (signature === last) return;
      last = signature;
      deps.onProgress?.({ step, phase, reading: shownReading || reading, answer: shownAnswer, tools: [] });
    };
  };

  /** Whether a final step that broke its own shape has already been handed back. Once is teaching; twice is a loop. */
  let toldOnce = false;
  const result = (final: Partial<FinalStep> & { answer: string }): TurnResult =>
    assemble(
      { question: input.question, calls, used, reading },
      { sqlUsed: [], outcome: "answered", checked: [], next: [], clarify: null, emailDraft: null, exhausted: false, ...final },
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
      // One flat schema stands for two shapes here, a tool step and a final
      // answer, so half its fields belong to whichever shape this step is not.
      // Told they are required, the model writes all of them every time: an
      // empty answer and an empty `next` on every look, and `thing`, `count`
      // and `basis` spelled out as null on every move.
      defaultsOptional: true,
      onPreview: deps.onProgress ? watch(step) : undefined,
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
        emailDraft: value.email_draft,
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

    // The tools are named before they run rather than after, because running
    // them is the part with the seconds in it.
    deps.onProgress?.({ step, phase: "looking", reading, answer: "", tools: value.calls.map((call) => call.tool) });

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
