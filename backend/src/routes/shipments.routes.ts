import { Router } from "express";
import type { Pool } from "pg";

import { ShipmentQuery } from "../contracts";
import { shipmentRead } from "../ontology/repositories";

/** Shipments as the mail states them, for the business pages. Read only. */
export function shipmentsRouter(deps: { pool: Pool }): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const query = ShipmentQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "bad shipment query", issues: query.error.issues });
      return;
    }
    res.json(await shipmentRead.list(deps.pool, query.data));
  });

  router.get("/:emailId", async (req, res) => {
    const detail = await shipmentRead.detail(deps.pool, req.params.emailId);
    if (!detail) {
      res.status(404).json({ error: "no shipment was read from that email" });
      return;
    }
    res.json(detail);
  });

  return router;
}
