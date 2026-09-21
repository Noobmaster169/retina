import data from "../../reference/ports.json";

import { type Country, countryByCode, countryByName, normaliseName } from "./countries";

/**
 * Where a port is, from the world's list of ports rather than from a model.
 *
 * A port's name in this mail carries its country as a word and often a
 * UN/LOCODE in brackets. The country word is trusted; the code is not, because
 * the dataset writes stale codes on documents that name a different port. So
 * a port is found by its city words inside its country, and the code only
 * breaks a tie among candidates it agrees with. Pure.
 */

export interface ReferencePort {
  name: string;
  aliases: string[];
  countryCode: string;
  locode: string | null;
  lat: number;
  lon: number;
}

export interface LocatedPort {
  country: Country;
  locode: string | null;
  lat: number;
  lon: number;
  /** Which reference entry answered, for the log. */
  matched: string;
}

const PORTS = data as ReferencePort[];
const BY_COUNTRY = new Map<string, ReferencePort[]>();
for (const port of PORTS) {
  const held = BY_COUNTRY.get(port.countryCode);
  if (held) held.push(port);
  else BY_COUNTRY.set(port.countryCode, [port]);
}

export interface ParsedPortName {
  city: string;
  countryWord: string | null;
  code: string | null;
}

/** "KARACHI, PAKISTAN (PKKHI)", "CALLAO_PERU", "SINGAPORE (SGSIN)", "NHAVA SHEVA INDIA". */
export function parsePortName(canonical: string): ParsedPortName {
  let text = canonical.trim();
  let code: string | null = null;
  const bracket = /\s*\(([A-Z]{5})\)\s*$/.exec(text);
  if (bracket) {
    code = bracket[1];
    text = text.slice(0, bracket.index).trim();
  }
  const split = /^(.+?)\s*[,_]\s*([^,_]+)$/.exec(text);
  if (split) return { city: split[1].trim(), countryWord: split[2].trim(), code };
  // No separator: the last words may still be a country, as in "NHAVA SHEVA INDIA".
  const words = text.split(/\s+/);
  for (let take = Math.min(3, words.length - 1); take >= 1; take--) {
    const tail = words.slice(-take).join(" ");
    if (countryByName(tail)) return { city: words.slice(0, -take).join(" "), countryWord: tail, code };
  }
  return { city: text, countryWord: null, code };
}

const NOISE = new Set(["PORT", "OF", "THE", "CITY", "TERMINAL", "HARBOUR", "HARBOR"]);

function cityWords(city: string): string[] {
  return normaliseName(city.replace(/\(.*?\)/g, " "))
    .split(" ")
    .filter((word) => word.length > 2 && !NOISE.has(word));
}

/**
 * How well one reference entry answers to these words: an exact name above an
 * exact alias, and both above a partial hit on either.
 *
 * The two ranks of exactness are not decoration. The world's list gives Los
 * Angeles the alias "Long Beach" and gives Long Beach the alias "Los Angeles",
 * and both are real ports with their own code. Scoring the two the same left
 * the tie to the order of the file, which put every spelling of Long Beach
 * that carried no usable code at Los Angeles, and the two stayed two things.
 */
function matches(port: ReferencePort, words: string[]): number {
  const wanted = words.join(" ");
  const names = [port.name, ...port.aliases].map(normaliseName);
  let best = 0;
  names.forEach((name, at) => {
    if (name === wanted) {
      best = Math.max(best, words.length + (at === 0 ? 2 : 1));
      return;
    }
    const hit = words.filter((word) => name.split(" ").some((part) => part === word || part.startsWith(word) || word.startsWith(part))).length;
    if (hit > best) best = hit;
  });
  return best;
}

/**
 * A spelling with no country word at all, such as "LE HAVRE", is looked for
 * by its whole name across the world. Only an exact name, and only when one
 * country holds it: "SANTOS" is in two, and guessing between them would be
 * a rule, so it stays unplaced until a person says which.
 */
function byNameAlone(city: string): LocatedPort | null {
  const wanted = normaliseName(city);
  if (!wanted) return null;
  const exact = PORTS.filter((port) => [port.name, ...port.aliases].some((name) => normaliseName(name) === wanted));
  const countries = new Set(exact.map((port) => port.countryCode));
  if (countries.size !== 1) return null;
  const pick = exact[0];
  const country = countryByCode(pick.countryCode);
  if (!country) return null;
  return { country, locode: pick.locode, lat: pick.lat, lon: pick.lon, matched: pick.name };
}

export function locatePort(canonical: string): LocatedPort | null {
  const parsed = parsePortName(canonical);
  // A city that is a country, such as Singapore, names its own country.
  const country = countryByName(parsed.countryWord) ?? countryByName(parsed.city) ?? (parsed.code ? countryByCode(parsed.code.slice(0, 2)) : null);
  if (!country) return parsed.countryWord === null ? byNameAlone(parsed.city) : null;
  const words = cityWords(parsed.city);
  const candidates = (BY_COUNTRY.get(country.code) ?? [])
    .map((port) => ({ port, score: words.length ? matches(port, words) : port.name.toUpperCase() === country.name.toUpperCase() ? 1 : 0 }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (candidates.length === 0) return null;
  const top = candidates[0].score;
  const tied = candidates.filter((entry) => entry.score === top);
  // The bracketed code decides only among equals, and only when it belongs to this country.
  const byCode = parsed.code && parsed.code.startsWith(country.code) ? tied.find((entry) => entry.port.locode === parsed.code) : undefined;
  const pick = (byCode ?? tied[0]).port;
  return { country, locode: pick.locode, lat: pick.lat, lon: pick.lon, matched: pick.name };
}
