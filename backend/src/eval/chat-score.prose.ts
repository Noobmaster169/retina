/**
 * Whether an answer reads the way the prompt asks: for a person running a
 * business, not a person running the database. Pure, and applied to every
 * question, because none of it depends on what was asked.
 *
 * Each rule is one the prompt states. A failure names the rule, so a prompt
 * change can be read against exactly the habit it was meant to break.
 */

export interface ProseFault {
  rule: string;
  detail: string;
}

const DASHES = /[–—]/;
const SCHEMA_NAME = /\b(?:core|analytics)\.[a-z_]+/i;
const OFFER = /\b(?:let me know|feel free|would you like|happy to|i can (?:pull|run|dig|look|help|show you)|i'd be happy)\b/i;
const GREETING = /^\s*(?:hello|hi|hey)\b/i;

/** At most this many sentences, a bullet line counting as one whatever its punctuation and a heading as none. */
export const MAX_SENTENCES = 8;

export function sentenceCount(answer: string): number {
  let count = 0;
  for (const raw of answer.split("\n")) {
    const line = raw.trim();
    if (line === "" || /^#{1,3}\s/.test(line)) continue;
    if (/^(?:[-*]|\d+[.)])\s/.test(line)) {
      count += 1;
      continue;
    }
    const ends = line.match(/[.!?](?=\s|$)/g)?.length ?? 0;
    count += Math.max(1, ends);
  }
  return count;
}

export function proseFaults(answer: string, outcome: string): ProseFault[] {
  const faults: ProseFault[] = [];
  if (DASHES.test(answer)) faults.push({ rule: "no dashes", detail: "an em or en dash" });
  const schema = SCHEMA_NAME.exec(answer);
  if (schema) faults.push({ rule: "no table names", detail: schema[0] });
  const offer = OFFER.exec(answer);
  if (offer) faults.push({ rule: "no offer", detail: offer[0] });
  if (GREETING.test(answer)) faults.push({ rule: "no greeting", detail: answer.slice(0, 20) });
  const sentences = sentenceCount(answer);
  if (sentences > MAX_SENTENCES) faults.push({ rule: `at most ${MAX_SENTENCES} sentences`, detail: `${sentences}` });
  // A question back is the clarify field's job; prose that ends in one is an offer by another name.
  if (outcome !== "needs_input" && /\?\s*$/.test(answer.trim())) faults.push({ rule: "no closing question", detail: answer.trim().slice(-60) });
  return faults;
}
