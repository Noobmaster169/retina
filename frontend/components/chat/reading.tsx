import type { ChatTurn } from "@/lib/api/chat-agent-schemas";

/**
 * How the agent read the question, and what it was working from.
 *
 * Above the answer, because a number is only as good as the question it
 * answers: which run, which things, what was counted. The second line names
 * the skills that were in front of the agent and the recipes it ran, so two
 * people asking the same thing can see they got the same query.
 *
 * A term the agent had to give a meaning to gets a line of its own with the
 * definition in full. A reader who disagrees with "Asia" can then disagree
 * with the words rather than with a number, which is the whole argument for
 * showing it. Where the set was only partly judged the line says so, because
 * a total over it is a lower bound.
 */

export function Reading({ turn }: { turn: ChatTurn }) {
  const recipes = [...new Set(turn.toolCalls.flatMap((call) => (call.recipe ? [`${call.recipe.name} v${call.recipe.version}`] : [])))];
  if (!turn.reading && turn.skillsUsed.length === 0 && recipes.length === 0 && turn.semantic.length === 0) return null;

  return (
    <div className="max-w-[72ch] space-y-1 border-l-2 border-hairline-strong pl-3">
      {turn.reading ? <p className="text-small leading-[19px] text-ink-secondary">{turn.reading}</p> : null}
      {turn.semantic.map((term) => (
        <p key={term.conceptId} className="text-small leading-[19px] text-ink-secondary">
          <span className="text-ink-primary">{term.phrase}</span>: {term.definition}{" "}
          <span className="text-ink-faint">
            {term.matched} of {term.judged + term.reused} judged matched
            {term.unknown > 0 ? `, ${term.unknown} with no basis either way` : null}
            {term.complete ? null : `; partial, ${term.deferred} not yet judged`}
          </span>
        </p>
      ))}
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
