import type { ChatTurn } from "@/lib/api/chat-agent-schemas";

/**
 * How the agent read the question, and what it was working from.
 *
 * Above the answer, because a number is only as good as the question it
 * answers: which run, which things, what was counted. The second line names
 * the skills that were in front of the agent and the recipes it ran, so two
 * people asking the same thing can see they got the same query.
 */

export function Reading({ turn }: { turn: ChatTurn }) {
  const recipes = [...new Set(turn.toolCalls.flatMap((call) => (call.recipe ? [call.recipe.name] : [])))];
  if (!turn.reading && turn.skillsUsed.length === 0 && recipes.length === 0) return null;

  return (
    <div className="max-w-[72ch] space-y-1 border-l-2 border-hairline-strong pl-3">
      {turn.reading ? <p className="text-small leading-[19px] text-ink-secondary">{turn.reading}</p> : null}
      {turn.skillsUsed.length > 0 || recipes.length > 0 || turn.adhoc ? (
        <p className="font-mono text-mono-xs text-ink-faint">
          {turn.skillsUsed.length > 0
            ? `skills: ${turn.skillsUsed.map((skill) => `${skill.name} v${skill.version}`).join(", ")}`
            : null}
          {turn.skillsUsed.length > 0 && recipes.length > 0 ? " · " : null}
          {recipes.length > 0 ? `recipes: ${recipes.join(", ")}` : null}
          {turn.adhoc ? " · its own SQL" : null}
        </p>
      ) : null}
    </div>
  );
}
