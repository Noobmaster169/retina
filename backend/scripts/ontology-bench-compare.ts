// node --import tsx scripts/ontology-bench-compare.ts a.json b.json
//
// How far two snapshots from ontology-parallel-bench.ts disagree about the
// graph, measured on the relation that matters: which spellings the ontology
// says are the same thing. Ids and canonical names are not compared, because
// which spelling is created first is exactly what an ordering change moves.

import { readFileSync } from "node:fs";

import { kindOfRole } from "../src/pipeline/ontology";

interface Snapshot {
  summary: { label: string };
  graph: {
    entities: { id: string; kind: string }[];
    names: { entity_id: string; value: string }[];
    sightings: { email_id: string; role: string; surface: string; entity_id: string }[];
    shipments: Record<string, string | null>[];
    groups?: Record<string, string | string[] | number | null>[];
  };
}

const [pathA, pathB] = process.argv.slice(2);
const a: Snapshot = JSON.parse(readFileSync(pathA, "utf8"));
const b: Snapshot = JSON.parse(readFileSync(pathB, "utf8"));

/** `kind|surface` to the entity holding it, from the sightings the reading wrote. */
function holders(snapshot: Snapshot): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of snapshot.graph.sightings) map.set(`${kindOfRole(s.role as never)}|${s.surface}`, s.entity_id);
  return map;
}

const holdA = holders(a);
const holdB = holders(b);
const shared = [...holdA.keys()].filter((key) => holdB.has(key));
const onlyA = holdA.size - shared.length;
const onlyB = holdB.size - shared.length;

let pairs = 0;
let together = 0;
let apartOnlyInA = 0;
let apartOnlyInB = 0;
const disagreements: string[] = [];
for (let i = 0; i < shared.length; i++) {
  for (let j = i + 1; j < shared.length; j++) {
    if (shared[i].split("|")[0] !== shared[j].split("|")[0]) continue;
    pairs++;
    const inA = holdA.get(shared[i]) === holdA.get(shared[j]);
    const inB = holdB.get(shared[i]) === holdB.get(shared[j]);
    if (inA && inB) together++;
    else if (inA && !inB) {
      apartOnlyInB++;
      disagreements.push(`${b.summary.label} keeps apart, ${a.summary.label} joins: ${shared[i]}  ~  ${shared[j]}`);
    } else if (!inA && inB) {
      apartOnlyInA++;
      disagreements.push(`${a.summary.label} keeps apart, ${b.summary.label} joins: ${shared[i]}  ~  ${shared[j]}`);
    }
  }
}

/** A link agrees when both runs point at things that share any stored spelling. */
function namesOf(snapshot: Snapshot): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const row of snapshot.graph.names) (map.get(row.entity_id) ?? map.set(row.entity_id, new Set()).get(row.entity_id))!.add(row.value);
  return map;
}
const namesA = namesOf(a);
const namesB = namesOf(b);
const emailsB = new Map(b.graph.shipments.map((row) => [row.email_id as string, row]));
let links = 0;
let linkAgree = 0;
for (const rowA of a.graph.shipments) {
  const rowB = emailsB.get(rowA.email_id as string);
  if (!rowB) continue;
  for (const column of Object.keys(rowA).filter((key) => key.endsWith("_id") && key !== "email_id")) {
    const idA = rowA[column];
    const idB = rowB[column];
    if (idA === null && idB === null) continue;
    links++;
    if (idA !== null && idB !== null && [...(namesA.get(idA) ?? [])].some((name) => namesB.get(idB)?.has(name))) linkAgree++;
  }
}

/** The consignments built from the readings: which emails share one, and whether its parties and ports are the same things. */
function shipmentSection(): void {
  const ga = a.graph.groups ?? [];
  const gb = b.graph.groups ?? [];
  if (ga.length === 0 && gb.length === 0) return;
  const byKeyB = new Map(gb.map((row) => [row.key as string, row]));
  const same = ga.filter((row) => byKeyB.has(row.key as string));
  console.log(`shipments built: ${ga.length} vs ${gb.length}; same emails in the same group ${same.length}`);
  let cells = 0;
  let cellAgree = 0;
  const differing: string[] = [];
  for (const rowA of same) {
    const rowB = byKeyB.get(rowA.key as string) as Record<string, string | string[] | number | null>;
    for (const column of ["shipper_id", "consignee_id", "notify_party_id", "pol_id", "pod_id", "carrier_id", "vessel_id", "commodity_id"]) {
      const idA = rowA[column] as string | null;
      const idB = rowB[column] as string | null;
      if (idA === null && idB === null) continue;
      cells++;
      const shared = idA !== null && idB !== null && [...(namesA.get(idA) ?? [])].some((name) => namesB.get(idB)?.has(name));
      if (shared) cellAgree++;
      else differing.push(`${String(rowA.key).slice(0, 40)} ${column}: ${idA === null ? "none" : [...(namesA.get(idA) ?? [])][0]} vs ${idB === null ? "none" : [...(namesB.get(idB) ?? [])][0]}`);
    }
  }
  console.log(`shipment parties and ports compared: ${cells}; same thing in both ${cells === 0 ? "n/a" : ((100 * cellAgree) / cells).toFixed(1) + "%"}`);
  for (const line of differing.slice(0, 8)) console.log(`  ${line}`);
}

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);
console.log(`${a.summary.label} vs ${b.summary.label}`);
console.log(`spellings read: ${holdA.size} vs ${holdB.size}; shared ${shared.length} (${pct(shared.length, Math.max(holdA.size, holdB.size))}); only in first ${onlyA}, only in second ${onlyB}`);
console.log(`same-kind spelling pairs compared: ${pairs}; agree ${pct(pairs - apartOnlyInA - apartOnlyInB, pairs)}; joined in both ${together}`);
console.log(`  first joins what second keeps apart: ${apartOnlyInB}; second joins what first keeps apart: ${apartOnlyInA}`);
console.log(`shipment links compared: ${links}; same thing in both ${pct(linkAgree, links)}`);
for (const line of disagreements.slice(0, 20)) console.log(`  ${line}`);
shipmentSection();
