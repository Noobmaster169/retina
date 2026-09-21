/**
 * What the rail calls a conversation, from the first question asked in it.
 *
 * The rail used to show the question itself, cut at seventy characters with an
 * ellipsis on the end. Every row then ended in the same three dots and the
 * words before them were whatever the sentence happened to be at that point,
 * so a column of conversations read as a column of unfinished sentences and
 * told a person nothing about which one they wanted.
 *
 * This is a trim of the question and not a summary of it: no model is asked,
 * because a label on a list is not worth a call or the wait for one. What it
 * does is stop at a natural edge and never at an arbitrary character, and
 * never add a mark saying there is more. Where the trimmed title is still too
 * wide for the rail, the rail fades it out rather than cutting it.
 *
 * Pure: a string in, a string out.
 */

/** Past this a title stops being a label and starts being the question again. */
const MAX_WORDS = 5;
const MAX_CHARS = 38;

/**
 * Words that carry nothing at the end of a label. A title ending in "the" or
 * "and" reads as cut off, which is the thing this exists to avoid; ending one
 * word earlier reads as chosen.
 */
const WEAK_LAST = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for", "with", "from", "by",
  "as", "is", "are", "was", "were", "that", "this", "these", "those", "its", "their", "our", "my",
]);

/** The question up to its first clause break, where one comes early enough to be the whole subject. */
function firstClause(words: string[]): string[] {
  const at = words.findIndex((word) => /[,;:]$/.test(word));
  return at >= 0 && at < MAX_WORDS ? words.slice(0, at + 1) : words;
}

export function conversationTitle(question: string): string {
  const words = firstClause(question.trim().split(/\s+/).filter(Boolean));
  if (words.length === 0) return "A new question";

  const kept: string[] = [];
  let width = 0;
  for (const word of words.slice(0, MAX_WORDS)) {
    // The first word goes in whatever its length, or a long one would title nothing.
    if (kept.length > 0 && width + 1 + word.length > MAX_CHARS) break;
    width += (kept.length > 0 ? 1 : 0) + word.length;
    kept.push(word);
  }
  while (kept.length > 1 && WEAK_LAST.has(strip(kept[kept.length - 1]).toLowerCase())) kept.pop();

  const title = strip(kept.join(" "));
  return title === "" ? "A new question" : title;
}

/** Trailing punctuation a label does not need. An inner apostrophe or hyphen is part of the word. */
function strip(text: string): string {
  return text.replace(/[\s,;:.!?–—-]+$/u, "");
}
