// pnpm reference:build <unlocode code-list.csv> <country-codes.csv> <sea-ports ports.json>
//
// Turns three public datasets into the two reference files the backend
// ships. Run once when the sources move; the outputs are committed, the
// inputs are not.
//
//   UN/LOCODE code list   https://raw.githubusercontent.com/datasets/un-locode/main/data/code-list.csv   (UNECE, public)
//   Country codes         https://raw.githubusercontent.com/datasets/country-codes/main/data/country-codes.csv   (public domain)
//   sea-ports             https://unpkg.com/sea-ports/lib/ports.json   (MIT, marchah/sea-ports)
//
// A port keeps its name, country code, locode and coordinates; a country its
// code, names and the UN geoscheme region and subregion. Nothing here is
// classification: these are the world's reference lists, not rules over mail.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [unlocodePath, countriesPath, seaPortsPath] = process.argv.slice(2);
if (!unlocodePath || !countriesPath || !seaPortsPath) throw new Error("three source paths are needed");

function csv(text: string): string[][] {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const out: string[] = [];
      let cur = "";
      let quoted = false;
      for (const c of line) {
        if (c === '"') quoted = !quoted;
        else if (c === "," && !quoted) {
          out.push(cur);
          cur = "";
        } else cur += c;
      }
      out.push(cur);
      return out;
    });
}

/** "2446N 06720E" as decimal degrees. */
function coordinate(text: string): [number, number] | null {
  const m = /^(\d{2})(\d{2})([NS]) (\d{3})(\d{2})([EW])$/.exec(text);
  if (!m) return null;
  const lat = (Number(m[1]) + Number(m[2]) / 60) * (m[3] === "S" ? -1 : 1);
  const lon = (Number(m[4]) + Number(m[5]) / 60) * (m[6] === "W" ? -1 : 1);
  return [Number(lat.toFixed(4)), Number(lon.toFixed(4))];
}

interface RefPort {
  name: string;
  aliases: string[];
  countryCode: string;
  locode: string | null;
  lat: number;
  lon: number;
}

const ports = new Map<string, RefPort>();
const sea = JSON.parse(readFileSync(seaPortsPath, "utf8")) as Record<
  string,
  { name: string; city?: string; alias?: string[]; coordinates?: [number, number]; unlocs?: string[] }
>;
for (const [key, port] of Object.entries(sea)) {
  if (!port.coordinates) continue;
  const locode = port.unlocs?.[0] ?? key;
  ports.set(locode, {
    name: port.name,
    aliases: [...new Set([port.city, ...(port.alias ?? [])].filter((a): a is string => !!a && a !== port.name))],
    countryCode: locode.slice(0, 2),
    locode,
    lat: port.coordinates[1],
    lon: port.coordinates[0],
  });
}
const [, ...unlocode] = csv(readFileSync(unlocodePath, "utf8"));
for (const row of unlocode) {
  const [, country, location, name, plain, , , fn, , , coords] = row;
  if ((fn ?? "")[0] !== "1") continue;
  const at = coordinate(coords ?? "");
  if (!at) continue;
  const locode = `${country}${location}`;
  if (ports.has(locode)) continue;
  ports.set(locode, { name: plain || name, aliases: name !== plain ? [name] : [], countryCode: country, locode, lat: at[0], lon: at[1] });
}

const [head, ...countryRows] = csv(readFileSync(countriesPath, "utf8"));
const col = (label: string) => head.indexOf(label);
const countries = countryRows
  .map((row) => ({
    code: row[col("ISO3166-1-Alpha-2")],
    name: row[col("CLDR display name")] || row[col("UNTERM English Short")] || row[col("official_name_en")],
    aliases: [...new Set([row[col("UNTERM English Short")], row[col("official_name_en")], row[col("CLDR display name")]].filter(Boolean))],
    region: row[col("Region Name")] || null,
    subregion: row[col("Sub-region Name")] || null,
  }))
  .filter((c) => c.code && c.name);

const out = join(import.meta.dirname, "..", "reference");
writeFileSync(join(out, "ports.json"), JSON.stringify([...ports.values()]));
writeFileSync(join(out, "countries.json"), JSON.stringify(countries));
console.log(`${ports.size} ports, ${countries.length} countries`);
