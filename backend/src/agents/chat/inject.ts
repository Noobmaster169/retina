/**
 * Which skills the harness puts in front of the agent without being asked.
 *
 * Decided from facts the harness can see, never from the words of the
 * question: no regex over it, no keyword table. That would be a subject
 * keyword table by another name, fitted to the questions someone happened to
 * think of. What cannot be seen here, the agent asks for with `load_skill`.
 *
 * Pure.
 */

/** Past this the cards are enough; more bodies crowd out the question. */
export const MAX_INJECTED = 3;

export interface TurnFacts {
  scope: { runId: string | null; emailId: string | null; contextKinds?: string[] };
  /** A call on this turn was refused by the literal guard. */
  guardRefused: boolean;
  /** A lookup on this turn found nothing, or nothing exact. */
  cameUpEmpty: boolean;
  /** A lookup on this turn returned candidates of more than one kind. */
  ambiguous: boolean;
  /**
   * A call on this turn gave a term a meaning.
   *
   * The harness cannot see that a question holds one before the agent looks:
   * deciding that from the words would be a subject keyword table by another
   * name. What it can see is that a term was given a meaning, and from the next
   * step on the rules for reporting one are in front of the agent. Before that,
   * the skill's card is, and `load_skill` is the way in.
   */
  gaveMeaning: boolean;
  /** Skills the agent loaded on this turn. Already in front of it once; repeated so they survive to the next step. */
  loaded: string[];
  /** Skills loaded or picked earlier in this conversation. */
  sticky: string[];
  /** Skills the person picked for this message. */
  picked: string[];
}

export type How = "picked" | "loaded" | "injected";

export interface Injected {
  name: string;
  how: How;
}

/**
 * In the order they matter: what the person asked for, what this turn has
 * shown to be needed, what the conversation is about, what it used before.
 * `known` is the registry's names, so a skill that no longer exists is dropped
 * rather than failing a turn.
 */
export function skillsToInject(facts: TurnFacts, known: ReadonlySet<string>): Injected[] {
  const wanted: Injected[] = [
    ...facts.picked.map((name) => ({ name, how: "picked" as const })),
    ...facts.loaded.map((name) => ({ name, how: "loaded" as const })),
  ];
  if (facts.guardRefused || facts.cameUpEmpty) wanted.push({ name: "ground-names", how: "injected" });
  if (facts.cameUpEmpty) wanted.push({ name: "near-misses", how: "injected" });
  if (facts.ambiguous) wanted.push({ name: "ask-back", how: "injected" });
  if (facts.gaveMeaning) wanted.push({ name: "meaning-terms", how: "injected" });
  // An email attached to the question is an email in front of the agent, as one the conversation opened on is.
  const emailInFront = facts.scope.emailId !== null || (facts.scope.contextKinds ?? []).includes("email");
  if (emailInFront) wanted.push({ name: "explain-an-email", how: "injected" });
  if (facts.scope.runId && !emailInFront) wanted.push({ name: "pick-the-run", how: "injected" });
  wanted.push(...facts.sticky.map((name) => ({ name, how: "loaded" as const })));

  const seen = new Set<string>();
  const kept: Injected[] = [];
  for (const item of wanted) {
    if (!known.has(item.name) || seen.has(item.name)) continue;
    seen.add(item.name);
    kept.push(item);
    if (kept.length === MAX_INJECTED) break;
  }
  return kept;
}
