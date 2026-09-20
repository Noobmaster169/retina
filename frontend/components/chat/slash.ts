import type { ChatSkillCard } from "@/lib/api/chat-agent-schemas";

/**
 * The `/` menu's rule: when the composer is naming a skill rather than typing
 * a question, and which skills that name reaches.
 *
 * Pure, and split from the composer, because the rule has edges: a question may
 * contain a date, a path or a ratio, and none of those should open a menu over
 * what someone is writing. Only a slash that starts the box does.
 */

/** The word after a leading `/`, or null when the text is an ordinary question. */
export function slashFilter(text: string): string | null {
  const match = /^\/([a-z-]*)$/.exec(text);
  return match ? match[1] : null;
}

/** The skills a typed name reaches. An empty name reaches them all, which is what a bare `/` shows. */
export function matchingSkills(cards: ChatSkillCard[], filter: string): ChatSkillCard[] {
  return cards.filter((card) => card.name.includes(filter.toLowerCase()));
}
