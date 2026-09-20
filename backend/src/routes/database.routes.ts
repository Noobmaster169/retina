import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

import { database, databaseRows } from "../ontology/repositories";

/**
 * The schema as rows.
 *
 * It reads through the read-write pool and not the chat's read-only one, on
 * purpose: this page composes its own SQL from catalog-validated identifiers
 * and takes nothing a caller wrote, so it has no query for a read-only role to
 * protect it from. `run_sql` is the only path in this product that runs SQL
 * somebody else composed, and it is the only one that needs the guardrail.
 */

export interface DatabaseRouteDeps {
  pool: Pool;
}

const Schema = z.enum(["core", "analytics"]);
const Name = z.string().regex(/^[a-z_][a-z0-9_]*$/).max(64);
const Page = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export function databaseRouter(deps: DatabaseRouteDeps): Router {
  const router = Router();
  const { pool } = deps;

  router.get("/tables", async (_req, res) => {
    res.json({ tables: await database.listTables(pool) });
  });

  router.get("/tables/:schema/:name", async (req, res) => {
    const schema = Schema.safeParse(req.params.schema);
    const name = Name.safeParse(req.params.name);
    const page = Page.safeParse(req.query);
    if (!schema.success || !name.success || !page.success) {
      res.status(400).json({ error: "bad schema, table or page" });
      return;
    }
    const body = await databaseRows.tablePage(pool, { schema: schema.data, name: name.data, ...page.data });
    if (!body) {
      res.status(404).json({ error: "no such table" });
      return;
    }
    res.json(body);
  });

  router.get("/tables/:schema/:name/rows/:id", async (req, res) => {
    const schema = Schema.safeParse(req.params.schema);
    const name = Name.safeParse(req.params.name);
    if (!schema.success || !name.success) {
      res.status(400).json({ error: "bad schema or table" });
      return;
    }
    const body = await databaseRows.rowDetail(pool, schema.data, name.data, req.params.id);
    if (!body) {
      res.status(404).json({ error: "no such row, or the table has no single-column key to find one by" });
      return;
    }
    res.json(body);
  });

  return router;
}
