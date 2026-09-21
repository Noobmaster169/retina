import type { StructuredCall } from "../structured";
import type { ResolvedContext } from "./context";
import type { FinishedCall } from "./loop.steps";
import { transcribe } from "./loop.steps";
import type { Standing } from "./standing";
import { toolDescriptions } from "./tools";

/**
 * What the model is given before the question: the eleven labelled sections of
 * one step's prompt. Split from loop.ts, which runs the steps.
 *
 * The order is the order they are read in. The standing texts first because
 * they decide how everything after them is treated, the question last because
 * a model answers what it read most recently.
 */

export interface Scope {
  runId: string | null;
  emailId: string | null;
  /** What the person had attached when they asked. Empty on most turns. */
  context: ResolvedContext[];
}

export interface InputParts {
  held: Standing;
  orientation: string;
  scope: Scope;
  today: string;
  history: { role: "user" | "assistant"; content: string }[];
  /** What earlier turns of this conversation grounded, rendered. Empty on the first question. */
  memory: string;
  /** The bodies of the skills in front of the agent on this step. */
  skillBodies: string[];
  calls: FinishedCall[];
  /** What the loop told the agent about its own steps that were not tool calls. */
  notes: string[];
  question: string;
}

/** What the model is told about the scope it was opened in. A default it may widen, never a filter it cannot see past. */
export function scopeText(scope: Scope): string {
  const parts = [
    scope.runId ? `run ${scope.runId}` : "no particular run",
    scope.emailId ? `the email ${scope.emailId}` : null,
  ].filter((part): part is string => part !== null);
  const opened = `This conversation was opened about ${parts.join(", and ")}. Use it where the question does not say otherwise, and go wider when the question asks something wider.`;
  if (scope.context.length === 0) return opened;
  const looking = `The person is looking at: ${scope.context.map((item) => item.title).join(", ")}. Answer about them unless the question says otherwise; a question about something else is answered as asked.`;
  return [opened, looking, ...scope.context.map((item) => `- ${item.line}`)].join("\n");
}

function historyText(history: InputParts["history"]): string[] {
  return history.map((turn) => `${turn.role === "user" ? "they asked" : "you answered"}: ${turn.content}`);
}

export function stepInput(parts: InputParts): StructuredCall<unknown>["input"] {
  const { held, calls, notes } = parts;
  return {
    "Standing instructions": held.instructions,
    "Orientation: what the database holds right now": parts.orientation,
    "The skills, and the recipes each brings": held.skillCards,
    "Skills for this turn":
      parts.skillBodies.length > 0 ? parts.skillBodies.join("\n\n") : "(none injected; load one if a card matches)",
    "Every recipe, as run_recipe takes it": held.recipeSignatures,
    "The schema you may query": held.schemaDocs,
    "The tools you have": toolDescriptions(),
    "The scope of this conversation": `${scopeText(parts.scope)} Today is ${parts.today}.`,
    "What this conversation already knows": parts.memory === "" ? "(nothing yet)" : parts.memory,
    "The conversation so far": parts.history.length > 0 ? historyText(parts.history) : "(this is the first question)",
    "What you have done on this turn": calls.length + notes.length > 0 ? [...calls.map(transcribe), ...notes] : "(nothing yet)",
    "The question": parts.question,
  };
}
