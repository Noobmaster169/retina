import { closePool, closeRoPool, getPool } from "../src/db";
import { refreshIfStale } from "../src/ontology/derived";

/**
 * Brings the analytics views and the resolved ontology level with core, now.
 *
 * The worker does this every five minutes. This exists for the two times that
 * is not good enough: straight after a deploy that added the schema, when the
 * views are created populated and the resolved tables are empty, and before a
 * demo, when nobody wants to wait out a tick to see the ontology fill.
 */
const result = await refreshIfStale(getPool());
console.log(
  result.views || result.entities !== null
    ? `refreshed: views ${result.views ? "rebuilt" : "already level"}, ${result.entities ?? "no"} things resolved`
    : "already level with core",
);
await closePool();
await closeRoPool();
