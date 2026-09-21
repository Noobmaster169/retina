import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

import { ATTRIBUTES, EditAttributesBody, EntityKind, MergeBody, RenameBody } from "../contracts";
import { withTx } from "../db";
import { entityEdit, entities } from "../ontology/repositories";
import { EditRefused } from "../ontology/repositories/entities.edit";

/**
 * A person correcting a resolved thing from its page: attributes, name, or
 * which other thing it is the same as. Beside ontology.routes.ts, which only
 * reads. Every route answers with the row as the pages read it.
 */

const Id = z.string().regex(/^\d+$/);

/** A coordinate a person typed, as text on the way in and a number on the globe. */
const Coordinate = (limit: number) =>
  z
    .string()
    .trim()
    .refine((value) => Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit, `a number between -${limit} and ${limit}`)
    .transform((value) => String(Number(value)));

/** That kind's attributes, any subset, unknown keys refused, coordinates checked. */
function attributesOf(kind: EntityKind): z.ZodType<Record<string, string | null>> {
  const base = ATTRIBUTES[kind] as z.ZodObject<z.ZodRawShape>;
  const shape = base.partial().strict();
  if (kind !== "port") return shape as z.ZodType<Record<string, string | null>>;
  return shape.extend({ lat: Coordinate(90).nullable().optional(), lon: Coordinate(180).nullable().optional() }).strict() as z.ZodType<Record<string, string | null>>;
}

export function ontologyEditRouter(deps: { pool: Pool }): Router {
  const router = Router();
  const { pool } = deps;

  const answer = async (res: Parameters<Parameters<Router["patch"]>[1]>[1], id: string, work: () => Promise<void>) => {
    try {
      await work();
    } catch (error) {
      if (error instanceof EditRefused) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
    res.json(await entities.find(pool, id));
  };

  router.patch("/:type/:id/attributes", async (req, res) => {
    const kind = EntityKind.safeParse(req.params.type);
    const id = Id.safeParse(req.params.id);
    const body = EditAttributesBody.safeParse(req.body);
    if (!kind.success || !id.success || !body.success) {
      res.status(400).json({ error: "bad kind, id or body", issues: body.success ? [] : body.error.issues });
      return;
    }
    const attributes = attributesOf(kind.data).safeParse(body.data.attributes);
    if (!attributes.success) {
      res.status(400).json({ error: `not attributes a ${kind.data} has`, issues: attributes.error.issues });
      return;
    }
    await answer(res, id.data, () => withTx(pool, (tx) => entityEdit.setAttributes(tx, kind.data, id.data, attributes.data, body.data.actor)));
  });

  router.post("/:type/:id/rename", async (req, res) => {
    const kind = EntityKind.safeParse(req.params.type);
    const id = Id.safeParse(req.params.id);
    const body = RenameBody.safeParse(req.body);
    if (!kind.success || !id.success || !body.success) {
      res.status(400).json({ error: "bad kind, id or body" });
      return;
    }
    await answer(res, id.data, () => withTx(pool, (tx) => entityEdit.rename(tx, kind.data, id.data, body.data.name, body.data.actor)));
  });

  router.post("/:type/:id/merge", async (req, res) => {
    const kind = EntityKind.safeParse(req.params.type);
    const id = Id.safeParse(req.params.id);
    const body = MergeBody.safeParse(req.body);
    if (!kind.success || !id.success || !body.success) {
      res.status(400).json({ error: "bad kind, id or body" });
      return;
    }
    await answer(res, body.data.into, () => withTx(pool, (tx) => entityEdit.mergeInto(tx, kind.data, id.data, body.data.into, body.data.actor)));
  });

  return router;
}
