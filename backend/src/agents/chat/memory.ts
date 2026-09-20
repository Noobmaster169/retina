import type { ConversationMemory } from "../../ontology/repositories/chat.memory";

/**
 * What this conversation already knows, as the agent reads it.
 *
 * It exists for one sentence: "and their notify parties?". The names in it are
 * how the data spells them, so the agent grounds the remembered canonical
 * again by exact match, which is one indexed lookup and survives the resolved
 * things being rebuilt. Ids are deliberately absent: they change on a refresh.
 *
 * For the model and not for the literal guard. Nothing here counts as shown:
 * an earlier turn's answer repeats the person's own words back, so grounding a
 * filter on it would ground it on the question, which is the failure the guard
 * exists to stop. A remembered canonical still passes the guard, because it is
 * a stored spelling and `knownValues` finds it.
 *
 * Pure.
 */

/** Past this the list stops being memory and starts crowding out the question. */
const MAX_THINGS = 12;

export function renderMemory(memory: ConversationMemory): string {
  const lines: string[] = [];

  if (memory.things.length > 0) {
    lines.push("Things you grounded earlier in this conversation. Ground a name again by its canonical before you filter on it; the ids have changed.");
    lines.push("kind\tcanonical\tother spellings");
    for (const thing of memory.things.slice(0, MAX_THINGS)) {
      lines.push([thing.kind, thing.canonical, thing.spellings.join(" | ")].join("\t"));
    }
  }

  if (memory.runsUsed.length > 0) {
    lines.push("", `Runs you answered for earlier: ${memory.runsUsed.join(", ")}. Use the same one unless the question says otherwise.`);
  }

  if (memory.openQuestion !== null) {
    lines.push(
      "",
      `You asked this and it has not been answered yet: "${memory.openQuestion.question}"`,
      `The options you offered: ${memory.openQuestion.options.join("; ")}.`,
      "If this message answers it, take that reading and answer. Do not ask again.",
    );
  }

  return lines.join("\n");
}
