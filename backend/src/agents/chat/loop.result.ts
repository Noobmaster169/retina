import type {
  ChatGraph,
  ChatNextMove,
  ChatOutcome,
  ChatToolCall,
  ClarifyingQuestion,
  GroundedThing,
} from "../../contracts";
import { buildGraph } from "./graph";
import type { How } from "./inject";
import type { FinishedCall } from "./loop.steps";
import { forWire } from "./loop.steps";
import { keepReal, settle } from "./next-moves";
import { skillVersions } from "./skills/registry";

/**
 * What a turn hands back, assembled from what actually happened on it. Split
 * from loop.ts, which runs the steps.
 *
 * Every field here is read off the calls rather than off the model's own
 * account of them: the SQL that ran beats the SQL it remembers running, the
 * graph is built from what the tools reported, and an alternative it offers is
 * kept only where a result carried the thing and the number together.
 */

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
  outcome: ChatOutcome;
  checked: string[];
  next: ChatNextMove[];
  clarify: ClarifyingQuestion | null;
  /** The resolved things this turn grounded, for the turns after it to remember by name. */
  grounded: GroundedThing[];
  /**
   * How many alternatives were dropped because their thing or their number did
   * not come back from a tool on this turn.
   *
   * Not on the wire and not drawn: a reader should never learn what the agent
   * nearly said. It is here because the eval set asks the opposite question of
   * every interactive turn, which is whether anything had to be dropped at all.
   */
  removedMoves: number;
  /** True when the step budget ran out: the answer is what it had, and the page says so. */
  exhausted: boolean;
}

/** What the loop accumulated over the turn, whichever way it ended. */
export interface TurnSoFar {
  question: string;
  calls: FinishedCall[];
  used: Map<string, How>;
  reading: string;
}

/** What the model said on the step that ended the turn. Empty on a turn that ran out of steps. */
export interface FinalStep {
  answer: string;
  sqlUsed: string[];
  outcome: ChatOutcome;
  checked: string[];
  next: ChatNextMove[];
  clarify: ClarifyingQuestion | null;
  exhausted: boolean;
}

/** Past this a conversation remembers a list rather than the names it worked with. */
const MAX_GROUNDED = 12;

/** What the turn grounded, most recent call first, one entry per canonical. */
function groundedIn(calls: FinishedCall[]): GroundedThing[] {
  const kept: GroundedThing[] = [];
  const seen = new Set<string>();
  for (const call of [...calls].reverse()) {
    for (const thing of call.things) {
      if (seen.has(thing.canonical)) continue;
      seen.add(thing.canonical);
      kept.push(thing);
      if (kept.length === MAX_GROUNDED) return kept;
    }
  }
  return kept;
}

export function assemble(so: TurnSoFar, final: FinalStep): TurnResult {
  const ran = so.calls.flatMap((call) => (call.sql ? [call.sql] : []));
  const claims = settle({ outcome: final.outcome, checked: final.checked, clarify: final.clarify });
  const kept = keepReal(
    final.next,
    so.calls.map((call) => call.grounds),
    so.question,
  );
  return {
    answer: final.answer,
    reading: so.reading,
    // What the tools actually ran beats what the model remembers running.
    sqlUsed: ran.length > 0 ? ran : final.sqlUsed,
    toolCalls: so.calls.map(forWire),
    graph: buildGraph(so.question, so.calls),
    skillsUsed: skillVersions([...so.used.keys()]).map((skill) => ({ ...skill, how: so.used.get(skill.name) ?? "injected" })),
    adhoc: so.calls.some((call) => call.tool === "run_sql" && call.ok),
    outcome: claims.outcome,
    checked: claims.checked,
    next: kept,
    clarify: claims.clarify,
    grounded: groundedIn(so.calls),
    removedMoves: final.next.length - kept.length,
    exhausted: final.exhausted,
  };
}

/** What was found, listed by tool and preview. The two endings that are not an answer both say it this way. */
function found(calls: FinishedCall[]): string {
  return calls.map((call) => `${call.tool} (${call.preview})`).join(", ");
}

/**
 * The budget is spent.
 *
 * Saying so with what was found beats a made-up answer and beats an error: the
 * tool results are on the page either way.
 */
export function exhaustedAnswer(calls: FinishedCall[], maxSteps: number): string {
  return (
    `I could not finish this within ${maxSteps} steps. What I found is under "Tools used": ${found(calls)}. ` +
    "Ask it again more narrowly, or name the run you mean."
  );
}

/** The person stopped it. What it had is kept, because half an answer with its working is still evidence. */
export function stoppedAnswer(calls: FinishedCall[], steps: number): string {
  return `Stopped after ${steps} ${steps === 1 ? "step" : "steps"}. What I had found is under "Tools used": ${found(calls)}.`;
}
