"use client";

import { useEffect, useState } from "react";

import { ChatSkillCards, type ChatSkillCard } from "@/lib/api/chat-agent-schemas";

/**
 * Picking a skill by hand, with `/` in the composer.
 *
 * A nudge and not a mode. A picked skill is injected exactly as one the harness
 * injects on an event, and the agent still follows its standing instructions:
 * this says "look at it this way", never "do only this".
 *
 * The menu lists what the registry holds, so a skill added to the repository
 * appears here without a second list to keep level. The bodies are never sent
 * to the browser; they are for the agent.
 */

/** At most three, which is the whole harness's injection budget. */
export const MAX_PICKED = 3;

export function useSkillCards(): ChatSkillCard[] {
  const [cards, setCards] = useState<ChatSkillCard[]>([]);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch("/api/chat/skills");
        if (!response.ok) return;
        const body = ChatSkillCards.parse(await response.json());
        if (live) setCards(body.skills);
      } catch {
        // The menu is a convenience. A question can always be asked without one.
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return cards;
}

export function SkillChips({ picked, onRemove }: { picked: string[]; onRemove(name: string): void }) {
  if (picked.length === 0) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-1.5">
      {picked.map((name) => (
        <li key={name}>
          <button
            type="button"
            onClick={() => onRemove(name)}
            aria-label={`Remove the ${name} skill`}
            className="flex items-center gap-1.5 rounded-sm border border-hairline bg-sunken px-2 py-1 font-mono text-mono-xs text-ink-secondary hover:bg-active"
          >
            {name}
            <span aria-hidden="true" className="text-ink-faint">
              x
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SkillMenu({
  cards,
  filter,
  onPick,
}: {
  cards: ChatSkillCard[];
  filter: string;
  onPick(name: string): void;
}) {
  const matching = cards.filter((card) => card.name.includes(filter.toLowerCase()));
  if (matching.length === 0) return null;

  return (
    <ul className="mb-2 max-h-56 overflow-y-auto rounded-lg border border-hairline bg-canvas shadow-overlay">
      {matching.map((card) => (
        <li key={card.name}>
          <button
            type="button"
            onClick={() => onPick(card.name)}
            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-active"
          >
            <span className="font-mono text-mono-xs text-ink">
              /{card.name} <span className="text-ink-faint">v{card.version}</span>
            </span>
            <span className="text-caption leading-[17px] text-ink-faint">{card.when}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
