import data from "../../reference/countries.json";

/**
 * The world's countries: ISO 3166 code, names, and the UN geoscheme region
 * and subregion. Reference data shipped with the backend, built by
 * scripts/reference-build.ts from public lists. Pure lookups over it.
 *
 * This is not a rule over mail. A country is a fact about the world, and the
 * names the mail writes for one are matched here by their words and nothing
 * else: no domain, no sender, no subject.
 */

export interface Country {
  code: string;
  name: string;
  aliases: string[];
  region: string | null;
  subregion: string | null;
}

const COUNTRIES = data as Country[];

/** The spellings the mail uses that no official list carries. Nothing here is inferred from a document; each is a name of the country. */
const ALIASES: Record<string, string> = {
  US: "US",
  USA: "US",
  "UNITED STATES": "US",
  UK: "GB",
  "UNITED KINGDOM": "GB",
  UAE: "AE",
  "SOUTH KOREA": "KR",
  KOREA: "KR",
  "NORTH KOREA": "KP",
  VIETNAM: "VN",
  TURKEY: "TR",
  RUSSIA: "RU",
  IRAN: "IR",
  SYRIA: "SY",
  LAOS: "LA",
  "IVORY COAST": "CI",
  TAIWAN: "TW",
  "HONG KONG": "HK",
  MACAU: "MO",
  TANZANIA: "TZ",
  BOLIVIA: "BO",
  VENEZUELA: "VE",
  MOLDOVA: "MD",
  BRUNEI: "BN",
  "CZECH REPUBLIC": "CZ",
  NETHERLANDS: "NL",
  PHILIPPINES: "PH",
};

export function normaliseName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));
const BY_NAME = new Map<string, Country>();
for (const country of COUNTRIES) {
  for (const name of [country.name, ...country.aliases]) BY_NAME.set(normaliseName(name), country);
  // "Iran (Islamic Republic of)" is also "Iran".
  for (const name of [country.name, ...country.aliases]) {
    const short = normaliseName(name.replace(/\(.*?\)/g, ""));
    if (!BY_NAME.has(short)) BY_NAME.set(short, country);
  }
}
for (const [alias, code] of Object.entries(ALIASES)) {
  const country = BY_CODE.get(code);
  if (country) BY_NAME.set(alias, country);
}

export function countryByCode(code: string | null | undefined): Country | null {
  if (!code) return null;
  return BY_CODE.get(code.toUpperCase()) ?? null;
}

/** A country from a name as the mail writes it: "PAKISTAN", "United Arab Emirates", "US", "Türkiye". */
export function countryByName(name: string | null | undefined): Country | null {
  if (!name) return null;
  const key = normaliseName(name);
  if (key === "") return null;
  return BY_NAME.get(key) ?? BY_NAME.get(key.replace(/^THE /, "")) ?? null;
}
