import type { ChatNextMove, ChatOutcome, ClarifyingQuestion } from "../../contracts";
import { shown } from "./grounding";

/**
 * What an answer may offer next, and what it may claim about itself.
 *
 * The rule this exists for: an alternative is real or it is not offered. Asked
 * about a port that is not there, a model will happily suggest a plausible
 * neighbouring one, and a plausible port with a plausible number is the worst
 * possible answer here, because it reads exactly like a true one. So code, not
 * the prompt, drops every alternative whose thing and number did not come back
 * from a tool on this turn.
 *
 * Checked against `grounds`, which is what the data returned, and never
 * against a call's `text`: the text also echoes what was asked for
 * (`Looking for "Jakarta"`), so a check against it would let the agent
 * recommend Jakarta on the strength of having asked about Jakarta.
 *
 * Pure.
 */

/** Past four, a row of chips stops being a next move and becomes a menu. */
export const MAX_MOVES = 4;

/** Trailing punctuation and case are not a difference between two questions. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").replace(/[?.!,;:]+$/, "").trim();
}

/** Whether `count` stands alone on `line`, rather than inside a longer number. */
function carries(line: string, count: number): boolean {
  const digits = String(count);
  let from = line.indexOf(digits);
  while (from !== -1) {
    const before = line[from - 1];
    const after = line[from + digits.length];
    const partOfANumber = (char: string | undefined) => char !== undefined && /[\d.,]/.test(char);
    if (!partOfANumber(before) && !partOfANumber(after)) return true;
    from = line.indexOf(digits, from + 1);
  }
  return false;
}

/**
 * Whether a thing and its number came back together.
 *
 * Line by line rather than over the whole text, because "somewhere in 20 kB of
 * results" is not evidence that this port had this count: a query listing
 * every port and a query counting one email would between them ground any
 * pairing at all. A row is what puts a value beside its number.
 */
function beside(grounds: string[], thing: string, count: number | null): boolean {
  if (!grounds.some((text) => shown(text, thing))) return false;
  if (count === null) return true;
  return grounds.some((text) => text.split("\n").some((line) => shown(line, thing) && carries(line, count)));
}

/**
 * The moves that survive: each one's thing and number came back from a tool on
 * this turn, none repeats the question, at most four.
 *
 * `grounds` is one string per finished call, never joined, so a thing from one
 * result cannot be paired with a number from another.
 */
export function keepReal(moves: ChatNextMove[], grounds: string[], question: string): ChatNextMove[] {
  const asked = normalise(question);
  const kept: ChatNextMove[] = [];
  const seen = new Set<string>();

  for (const move of moves) {
    // An alternative that names no thing is not an alternative; it is a follow-up
    // wearing the word, and the whole check below would pass it untouched.
    if (move.kind === "alternative" && move.thing === null) continue;
    if (normalise(move.prompt) === asked) continue;
    if (seen.has(normalise(move.prompt))) continue;
    if (move.thing !== null && !beside(grounds, move.thing, move.count)) continue;
    // A number with nothing to attach it to cannot be checked, so it is dropped rather than shown.
    if (move.thing === null && move.count !== null) continue;
    seen.add(normalise(move.prompt));
    kept.push(move);
    if (kept.length === MAX_MOVES) break;
  }
  return kept;
}

export interface FinalClaims {
  outcome: ChatOutcome;
  checked: string[];
  clarify: ClarifyingQuestion | null;
}

/**
 * What is wrong with a final step's claims about itself, in the words the
 * agent is handed back, or null when nothing is.
 *
 * Two claims carry an obligation: saying it found nothing obliges it to say
 * where it looked, and asking obliges it to offer the choices. Both are the
 * part a reader acts on, and an answer that makes the claim without the
 * evidence is worse than one that never claimed it.
 */
export function problemWith(final: FinalClaims): string | null {
  if (final.outcome === "none_found" && final.checked.length === 0) {
    return (
      "You answered none_found and left `checked` empty. Say where you looked, in the reader's words " +
      "(resolved ports, subject lines, email bodies, sender domains), or use a different outcome."
    );
  }
  if (final.outcome === "needs_input" && final.clarify === null) {
    return (
      "You answered needs_input and gave no `clarify`. Put the question and two to five options there, " +
      "each option a candidate a tool returned, or answer with the reading you think best and say which you took."
    );
  }
  return null;
}

/**
 * The claims as they are stored, once the agent has had its one chance to fix
 * them. A claim whose evidence never arrived is dropped rather than drawn: the
 * prose still stands, and the page does not render an empty artefact under it.
 */
export function settle(final: FinalClaims): FinalClaims {
  if (problemWith(final) === null) return final;
  return { ...final, outcome: "answered", clarify: final.outcome === "needs_input" ? null : final.clarify };
}
