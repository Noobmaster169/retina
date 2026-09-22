/**
 * A number on its way to being a number.
 *
 * The score is the one figure on this panel nobody expects, and a figure nobody
 * expects is worth a moment's attention before it settles. Rolling the digits
 * and locking them left to right buys that moment without saying anything: by
 * the time a reader has noticed it moving it has stopped, and what is left is
 * the number, not an effect.
 *
 * Only digits roll. The currency mark, the point and the spacing hold still,
 * so the shape of the thing never changes and nothing on the line reflows
 * while it runs.
 *
 * Pure: a target, how much of it has settled, and a source of randomness.
 */

export function scrambleLike(target: string, locked: number, random: () => number): string {
  let out = "";
  for (let at = 0; at < target.length; at++) {
    const char = target[at];
    out += at < locked || char < "0" || char > "9" ? char : String(Math.floor(random() * 10));
  }
  return out;
}

/**
 * How many frames it takes to settle a string of this length.
 *
 * One per character, and a floor so a short number still rolls long enough to
 * be seen. `$1.13` is five characters and would otherwise be over before a
 * reader had looked at it.
 */
export function framesFor(target: string): number {
  return Math.max(target.length, 8);
}
