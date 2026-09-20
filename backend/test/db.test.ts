import { afterAll, describe, expect, it } from "vitest";

import { closePool, getPool, withTx } from "../src/db";

/**
 * The pool's error listener, which is not an implementation detail.
 *
 * Postgres restarting drops every idle connection and `pg` reports that on the
 * pool. Node treats an emitter's `error` with no listener as fatal, so without
 * this the api process died instead of answering `/health` with postgres down:
 * the one reading auto-deploy rolls back on, and the first thing a person
 * looks at. It cost the phase 9 exit checklist a real failure.
 */

afterAll(closePool);

describe("getPool", () => {
  it("listens for a dropped idle connection, because an unhandled one ends the process", () => {
    expect(getPool().listenerCount("error")).toBeGreaterThan(0);
  });

  it("keeps serving after one is dropped", async () => {
    const pool = getPool();
    pool.emit("error", new Error("terminating connection due to administrator command"));

    await expect(withTx(pool, async (tx) => (await tx.query<{ n: number }>("select 1 as n")).rows[0].n)).resolves.toBe(1);
  });
});
