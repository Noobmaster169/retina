import type { EntityName } from "@/lib/api/ontology-schemas";

/**
 * The component that makes the ontology's argument.
 *
 * A port or a party exists only because the field judge said several spellings
 * denote one thing. Each spelling says how often it was seen and how it was
 * judged: nothing here came from a lookup table, and if it had, this screen
 * could not exist.
 */

const VERDICT: Record<EntityName["joinedBy"], { words: string; tone: string }> = {
  kept: { words: "the spelling kept", tone: "bg-sunken text-ink-secondary" },
  judge: { words: "same thing", tone: "bg-match-tint text-match" },
  human: { words: "joined by a person", tone: "bg-review-tint text-review" },
};

/** A judged spelling carries the confidence it was judged at: 0.85 is a different claim from 0.99. */
function verdictWords(name: EntityName): string {
  const base = VERDICT[name.joinedBy].words;
  if (name.joinedBy !== "judge" || name.confidence === null) return base;
  return `${base}, ${name.confidence.toFixed(2)}`;
}

export function WrittenTheseWays({ names }: { names: EntityName[] }) {
  return (
    <section className="min-w-0">
      <h3 className="text-caption font-medium text-ink-tertiary">Written these ways</h3>
      <ul>
        {names.map((name) => (
          <li key={name.value} className="border-b border-hairline-faint py-[9px]">
            <div className="truncate font-mono text-mono-sm text-ink">{name.value}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-caption text-ink-faint">
                on {name.seenCount} {name.seenCount === 1 ? "document" : "documents"}
              </span>
              <span className="grow" />
              <span
                className={`inline-flex h-[19px] shrink-0 items-center rounded-xs px-1.5 text-[10.5px] ${
                  VERDICT[name.joinedBy].tone
                }`}
              >
                {verdictWords(name)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
