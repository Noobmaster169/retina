/**
 * How a `From` header reads when a person is looking at it. Three screens drew
 * the same three lines from the same header, so they are one module: the
 * message card, the inbox row and the case line all name a sender the same way
 * or the product says two things about one person.
 *
 * Nothing here decides anything about an email. A header is a string the
 * sender wrote and these are three readings of it.
 */

/** The address inside the angle brackets, or the whole header when it carries none. */
export function senderAddress(from: string): string {
  return from.match(/<([^>]+)>/)?.[1] ?? from;
}

/**
 * The display name the sender gave, and failing that the local part read as a
 * name: `hanna_azhari@` is a person called Hanna Azhari, and the domain she
 * writes from is not her name.
 */
export function senderName(from: string): string {
  const named = from.match(/^\s*"?([^"<]+?)"?\s*</);
  if (named) return named[1];
  const [local] = senderAddress(from).split("@");
  return local.replace(/[._-]+/g, " ");
}

/** One or two letters for an avatar. Never more: the square is 20px. */
export function senderInitials(from: string): string {
  const words = senderName(from).split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "?").concat(words[1]?.[0] ?? "").toUpperCase();
}
