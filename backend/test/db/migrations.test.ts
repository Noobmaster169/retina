import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * A migration number is a place in a queue, and two files claiming the same
 * place is how a branch ends up being applied in an order nobody chose.
 *
 * It happened once: phase 13 and the shipments work each added an 023 and an
 * 024 on separate branches and were merged without renumbering. Nothing broke,
 * because `schema_migrations` keys on the filename rather than the number and
 * filename order still put `023_shipments` before the `024_shipment_key` that
 * depends on it. That was luck, not design, and the four are grandfathered
 * below rather than renamed: both phase 13 files use a bare `add column`, so
 * under a new filename they would be applied a second time and throw on every
 * database that already has them.
 *
 * The next one is 025.
 */

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "db", "migrations");

/** The one collision that exists, named so it can never quietly become two. */
const GRANDFATHERED = new Set(["023_chat_context.sql", "023_shipments.sql", "024_human_edits.sql", "024_shipment_key.sql"]);

async function filenames(): Promise<string[]> {
  return (await readdir(MIGRATIONS)).filter((name) => name.endsWith(".sql")).sort();
}

describe("db/migrations", () => {
  it("names every file NNN_name.sql", async () => {
    for (const name of await filenames()) expect(name).toMatch(/^\d{3}_[a-z0-9_]+\.sql$/);
  });

  it("gives every new migration a number of its own", async () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const name of await filenames()) {
      if (GRANDFATHERED.has(name)) continue;
      const number = name.slice(0, 3);
      const taken = seen.get(number);
      if (taken) clashes.push(`${number}: ${taken} and ${name}`);
      seen.set(number, name);
    }
    expect(clashes).toEqual([]);
  });

  it("does not reuse a number the grandfathered pair already holds", async () => {
    const spent = new Set([...GRANDFATHERED].map((name) => name.slice(0, 3)));
    const reused = (await filenames()).filter((name) => !GRANDFATHERED.has(name) && spent.has(name.slice(0, 3)));
    expect(reused).toEqual([]);
  });

  it("leaves no gap, so a number is a position and not a label", async () => {
    const numbers = [...new Set((await filenames()).map((name) => Number(name.slice(0, 3))))].sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, index) => index + numbers[0]));
  });
});
