import { type Injected, skillsToInject, type TurnFacts } from "./inject";
import { skills, skillText } from "./skills/registry";

/**
 * Which skills are in front of the agent on one step, and their text.
 *
 * Split from loop.ts so the loop reads as steps rather than as bookkeeping.
 * `inject.ts` decides which, from facts the harness can see; this turns that
 * decision into the bodies the prompt carries, dropping any whose folder is
 * gone rather than failing the turn.
 */

export interface StepSkills {
  injected: Injected[];
  bodies: string[];
}

export function skillsForStep(facts: TurnFacts): StepSkills {
  const all = skills();
  const injected = skillsToInject(facts, new Set(all.keys()));
  return {
    injected,
    bodies: injected.flatMap((item) => {
      const skill = all.get(item.name);
      return skill ? [skillText(skill)] : [];
    }),
  };
}
