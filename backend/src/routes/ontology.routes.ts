import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

import { type EntityDetail, EntityKind, type EntityList, ObjectType } from "../contracts";
import { emailGraph, isBuilt, listTypes, objectRecord } from "../ontology/objects";
import { buildInsight } from "../pipeline/ontology";
import { entityDetail, entityDossier, entityInsight, entityProfile, entityValues, entities, shipmentsRead } from "../ontology/repositories";

/**
 * The model as a model: what types exist, what one object holds, what links
 * out of it, and the spellings that were judged into a resolved thing.
 *
 * A type the schema does not hold answers 404 with `built: false` rather than
 * pretending. That is what lets the rail draw Shipment and Carrier dashed and
 * say why, instead of leaving a designed part of the model off the page.
 */

export interface OntologyRouteDeps {
  pool: Pool;
}

const TypeParam = ObjectType;
const RunQuery = z.uuid().optional();
const Hops = z.coerce.number().int().min(1).max(2).default(1);

/** How many appearances a record page shows before it says how many more there are. */
const APPEARANCES = 50;

export function ontologyRouter(deps: OntologyRouteDeps): Router {
  const router = Router();
  const { pool } = deps;

  /** The rail on both the database page and the ontology page, with live counts. */
  router.get("/types", async (_req, res) => {
    res.json({ types: await listTypes(pool) });
  });

  /** The consignments the mail is about, newest first. Its own route: a shipment is a group, not a spelling. */
  router.get("/shipment", async (_req, res) => {
    res.json(await shipmentsRead.list(pool));
  });

  router.get("/shipment/:id", async (req, res) => {
    // A shipment's id is a number. A word here is a link from somewhere that
    // does not know that, and it is a 404 rather than a failed cast.
    if (!/^\d+$/.test(req.params.id)) {
      res.status(404).json({ error: "no such shipment" });
      return;
    }
    const detail = await shipmentsRead.find(pool, req.params.id);
    if (!detail) {
      res.status(404).json({ error: "no such shipment" });
      return;
    }
    res.json(detail);
  });

  /** The index of one type. Only the resolved kinds have a list of their own; the rest are tables. */
  router.get("/:type", async (req, res) => {
    const type = TypeParam.safeParse(req.params.type);
    if (!type.success) {
      res.status(400).json({ error: "no such object type" });
      return;
    }
    const kind = EntityKind.safeParse(type.data);
    if (!kind.success) {
      res.status(404).json({
        error: `${type.data} is a table, not a resolved thing: read it through /database/tables`,
        built: isBuilt(type.data),
      });
      return;
    }
    const body: EntityList = {
      type: kind.data,
      built: true,
      entities: await entities.listByKind(pool, kind.data),
    };
    res.json(body);
  });

  /** One object of any built type, in the one shape every type shares. */
  router.get("/:type/:id", async (req, res) => {
    const type = TypeParam.safeParse(req.params.type);
    const runId = RunQuery.safeParse(req.query.runId);
    if (!type.success || !runId.success) {
      res.status(400).json({ error: "no such object type, or a bad run id" });
      return;
    }
    const record = await objectRecord(pool, type.data, req.params.id, runId.data ?? null);
    if (!record) {
      res.status(404).json({
        error: isBuilt(type.data) ? "no such object" : `${type.data} is designed and not built yet`,
        built: isBuilt(type.data),
      });
      return;
    }
    res.json(record);
  });

  /**
   * The four parts a resolved thing opens into: what is stored, step out from
   * here, written these ways, and where it appeared.
   */
  router.get("/:type/:id/detail", async (req, res) => {
    const kind = EntityKind.safeParse(req.params.type);
    if (!kind.success) {
      res.status(404).json({ error: "only a resolved thing has a detail: a port, party, carrier, vessel, commodity or person" });
      return;
    }
    const row = await entities.find(pool, req.params.id);
    if (!row || row.type !== kind.data) {
      res.status(404).json({ error: "no such thing" });
      return;
    }
    const [values, links, names, appearances, appearanceCount, profile, dossier, extras] = await Promise.all([
      entityValues.values(pool, req.params.id),
      entityDetail.around(pool, req.params.id),
      entityDetail.names(pool, req.params.id),
      entityDetail.appearances(pool, req.params.id, APPEARANCES),
      entityDetail.appearanceCount(pool, req.params.id),
      entityProfile.read(pool, req.params.id),
      entityDossier.loadDossierInput(pool, req.params.id),
      entityInsight.loadExtras(pool, req.params.id, kind.data),
    ]);
    // Counted on the list's own grain. `row.mentions` counts mentions, which is
    // a bigger number, and "last 3 of 24" beside a list of 6 was that mismatch.
    const insight = buildInsight({
      kind: kind.data,
      dossier: dossier ?? { kind: kind.data, canonical: row.name, names: [], roles: [], counterparties: [], lanes: [], goods: [], addresses: [], quotes: [], emails: row.emails, firstMailDate: null, lastMailDate: null },
      extras,
      markdown: profile?.markdown ?? null,
      attributes: profile?.attributes ?? {},
      attributeSources: profile?.attributeSources ?? {},
      spellings: names.length,
    });
    const body: EntityDetail = { row, values, links, names, appearances, appearanceCount, profile, insight };
    res.json(body);
  });

  /**
   * One object, one hop out, as nodes and named edges.
   *
   * Only an email for now, which is what both canvases draw. Another type's
   * graph is a different set of relations, not a parameter, and inventing one
   * for a type nobody has asked to see would be a picture of nothing.
   */
  router.get("/:type/:id/graph", async (req, res) => {
    const type = TypeParam.safeParse(req.params.type);
    const runId = RunQuery.safeParse(req.query.runId);
    const hops = Hops.safeParse(req.query.hops);
    if (!type.success || !runId.success || !hops.success) {
      res.status(400).json({ error: "bad object type, run id or hop count" });
      return;
    }
    if (type.data !== "email") {
      res.status(404).json({ error: "only an email has a graph today" });
      return;
    }
    const graph = await emailGraph(pool, req.params.id, runId.data ?? null, hops.data);
    if (!graph) {
      res.status(404).json({ error: "no such email" });
      return;
    }
    res.json(graph);
  });

  return router;
}
