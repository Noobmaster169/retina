import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * A migration number is a place in a queue, and two files claiming the same
 * place is how a branch ends up applied in an order nobody chose.
 *
 * It has happened three times: 023, 024 and 025 each hold two files, because
 * phase 13, the shipments work, the classify v6 change and the ingest gate
 * were built on separate branches and merged without renumbering. Nothing
 * broke. `schema_migrations` keys on the filename rather than the number, so
 * all six are applied and none is skipped, and filename order still puts every
 * 023 before every 024: the one real dependency, `024_shipment_key` on
 * `023_shipments`, holds. The pairs are independent otherwise, touching
 * `chat_turns`, `shipments`, `entities`, `prompt_versions` and three new
 * `gate_*` tables respectively.
 *
 * They are recorded here rather than renamed, because none of the six guards
 * its own statements: a bare `add column`, a `create table` and an `insert`
 * applied a second time under a new filename would throw on every database
 * that already has them.
 *
 * The next one is 026, and it is the only one of its number.
 */

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "db", "migrations");

/** How many files each number is allowed. A number absent from this map is allowed exactly one. */
const DOUBLED = new Map([
  ["023", 2],
  ["024", 2],
  ["025", 2],
  // Two sessions working the same day collided here: the awaiting-draft
  // outcome and the run rename, which was renumbered off 027 onto this one.
  ["028", 2],
]);

async function filenames(): Promise<string[]> {
  return (await readdir(MIGRATIONS)).filter((name) => name.endsWith(".sql")).sort();
}

async function byNumber(): Promise<Map<string, string[]>> {
  const held = new Map<string, string[]>();
  for (const name of await filenames()) {
    const number = name.slice(0, 3);
    held.set(number, [...(held.get(number) ?? []), name]);
  }
  return held;
}

describe("db/migrations", () => {
  it("names every file NNN_name.sql", async () => {
    for (const name of await filenames()) expect(name).toMatch(/^\d{3}_[a-z0-9_]+\.sql$/);
  });

  it("gives every number exactly the files it is recorded as holding", async () => {
    const wrong: string[] = [];
    for (const [number, names] of await byNumber()) {
      const allowed = DOUBLED.get(number) ?? 1;
      if (names.length !== allowed) wrong.push(`${number} holds ${names.length} (${names.join(", ")}), expected ${allowed}`);
    }
    expect(wrong).toEqual([]);
  });

  it("records no collision that has since been cleaned up", async () => {
    const held = await byNumber();
    const stale = [...DOUBLED.keys()].filter((number) => (held.get(number)?.length ?? 0) < 2);
    expect(stale).toEqual([]);
  });

  it("leaves no gap, so a number is a position and not a label", async () => {
    const numbers = [...(await byNumber()).keys()].map(Number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, index) => index + numbers[0]));
  });
});
