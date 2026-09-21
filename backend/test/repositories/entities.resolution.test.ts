import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { entityInputs, entityOverview, entityResolution } from "../../src/ontology/repositories";
import { reconcile, referenceJoins, resolveEntities } from "../../src/pipeline/ontology";
import { ACME_ME, ALPHA, seedInbox } from "../chat-seed";
import { inRollback } from "../db";

/**
 * The promise this makes to everything built on top of it: an id means the
 * same thing after a refresh as before it. A profile, a concept verdict and a
 * shipment column all hang on one.
 */

/** A refresh exactly as the scheduler runs it, over whatever this transaction can see. */
async function refresh(tx: PoolClient): Promise<number> {
  // One at a time: these all run on the test's single transaction client.
  const mentions = await entityInputs.loadMentions(tx);
  const verdicts = await entityInputs.loadVerdicts(tx);
  const joins = await entityInputs.loadResolveJoins(tx);
  const sightings = await entityInputs.loadSightings(tx);
  const existing = await entityInputs.loadExisting(tx);
  return entityResolution.applyResolution(tx, reconcile(resolveEntities(mentions, [...verdicts, ...joins, ...referenceJoins(mentions, sightings)], sightings), existing));
}

async function idOf(tx: PoolClient, canonical: string): Promise<string> {
  const { rows } = await tx.query<{ id: string }>("select id::text as id from core.entities where canonical = $1", [canonical]);
  return rows[0].id;
}


/** One resolved cluster with a single spelling, which is all the writer reads here. */
function cluster(kind: "party" | "port", canonical: string) {
  return {
    kind,
    canonical,
    names: [{ value: canonical, seenCount: 1, joinedBy: "kept" as const, confidence: null, joinedStep: null }],
    mentions: [],
    sightingCount: 1,
    firstSeenAt: new Date(0),
    lastSeenAt: new Date(0),
  };
}

describe("applying a resolution", () => {
  it("keeps every id, and the profile and the verdict written against it", async () => {
    await inRollback(async (tx) => {
      const seeded = await seedInbox(tx);
      const before = await idOf(tx, ALPHA);

      const concept = await tx.query<{ id: string }>(
        "insert into core.concepts (entity_kind, phrase, definition) values ('port', 'in Asia', 'a seaport in Asia') returning id::text as id",
      );
      await tx.query("update core.entities set profile_md = 'A seaport.', profile_version = 3, stale = false where id = $1::bigint", [before]);
      await tx.query(
        `insert into core.concept_verdicts (concept_id, entity_id, verdict, confidence, rationale, profile_version)
         values ($1::bigint, $2::bigint, 'yes', 0.9, 'the profile says so', 3)`,
        [concept.rows[0].id, before],
      );

      await refresh(tx);

      expect(await idOf(tx, ALPHA)).toBe(before);
      const { rows } = await tx.query<{ profile_md: string; n: string }>(
        `select e.profile_md, (select count(*)::text from core.concept_verdicts v where v.entity_id = e.id) as n
           from core.entities e where e.id = $1::bigint`,
        [before],
      );
      expect(rows[0]).toMatchObject({ profile_md: "A seaport.", n: "1" });
      expect(seeded.runId).toBeDefined();
    });
  });

  it("leaves a tombstone that get_entity follows, and never lists the merged row", async () => {
    await inRollback(async (tx) => {
      await seedInbox(tx);
      const survivor = await idOf(tx, ALPHA);

      // A thing with a spelling of its own, which a later verdict then says is
      // the same place. The next pass has one cluster where there were two.
      const { rows } = await tx.query<{ id: string }>(
        `insert into core.entities (kind, canonical, mention_count, name_count) values ('port', 'ALPHA HARBOUR', 0, 1)
         returning id::text as id`,
      );
      const loser = rows[0].id;
      await tx.query("insert into core.entity_names (entity_id, value, seen_count, joined_by) values ($1::bigint, 'ALPHA HARBOUR', 1, 'kept')", [loser]);
      await tx.query(
        `insert into core.entity_sightings (entity_id, email_id, role, source, surface, source_quote)
         select $1::bigint, min(email_id), 'port_of_discharge', 'subject', 'ALPHA HARBOUR', 'to ALPHA HARBOUR' from core.emails`,
        [loser],
      );
      await tx.query(
        `insert into core.entity_names (entity_id, value, seen_count, joined_by, confidence, joined_step)
         values ($1::bigint, 'ALPHA HARBOUR', 1, 'judge', 0.9, 'entity-resolve')`,
        [survivor],
      );

      await refresh(tx);

      const merged = await tx.query<{ merged_into: string }>("select merged_into::text as merged_into from core.entities where id = $1::bigint", [loser]);
      expect(merged.rows[0].merged_into).toBe(survivor);
      expect((await entityOverview.overview(tx, loser))?.id).toBe(survivor);
      expect(await entityOverview.overview(tx, loser)).toMatchObject({ canonical: ALPHA, mergedFrom: loser });

      const listed = await tx.query<{ n: string }>("select count(*)::text as n from core.entities where kind = 'port' and canonical = 'ALPHA HARBOUR' and merged_into is null");
      expect(listed.rows[0].n).toBe("0");
    });
  });

  it("folds two ports the world's list places at one code, and says the list joined them", async () => {
    await inRollback(async (tx) => {
      await seedInbox(tx);
      // Two spellings of Mombasa, each sighted once in a subject line, each its
      // own row, as the live inbox had them: no judge ever saw the pair.
      const ids: string[] = [];
      for (const spelling of ["MOMBASA, KENYA (KEMBA)", "MOMBASA_KENYA"]) {
        const id = await entityResolution.insertFromSighting(tx, "port", spelling, new Date());
        await tx.query(
          `insert into core.entity_sightings (entity_id, email_id, role, source, surface, source_quote)
           select $1::bigint, min(email_id), 'port_of_discharge', 'subject', $2::text, $2::text from core.emails`,
          [id, spelling],
        );
        ids.push(String(id));
      }

      await refresh(tx);

      const live = await tx.query<{ id: string; canonical: string }>(
        "select id::text as id, canonical from core.entities where kind = 'port' and merged_into is null and attributes->>'locode' = 'KEMBA'",
      );
      expect(live.rows).toHaveLength(1);
      expect(ids).toContain(live.rows[0].id);
      const names = await tx.query<{ value: string; joined_by: string }>(
        "select value, joined_by from core.entity_names where entity_id = $1::bigint order by value",
        [live.rows[0].id],
      );
      expect(names.rows).toEqual([
        { value: "MOMBASA, KENYA (KEMBA)", joined_by: names.rows[0].value === live.rows[0].canonical ? "kept" : "reference" },
        { value: "MOMBASA_KENYA", joined_by: names.rows[1].value === live.rows[0].canonical ? "kept" : "reference" },
      ]);
      expect(names.rows.map((row) => row.joined_by).sort()).toEqual(["kept", "reference"]);
    });
  });

  it("is idempotent: a second pass over the same data changes nothing", async () => {
    await inRollback(async (tx) => {
      await seedInbox(tx);
      const snapshot = async () =>
        (await tx.query<{ id: string; canonical: string }>("select id::text as id, canonical from core.entities where merged_into is null order by id")).rows;

      await refresh(tx);
      const first = await snapshot();
      await refresh(tx);
      expect(await snapshot()).toEqual(first);
    });
  });

  it("survives two things swapping their canonical spellings in one pass", async () => {
    await inRollback(async (tx) => {
      await seedInbox(tx);
      // `(kind, canonical)` is unique among the things that still denote
      // something. A pass that hands one thing the spelling another is about
      // to give up would break that halfway through the loop and abort the
      // whole refresh, so the writer parks every changing spelling first.
      const { rows } = await tx.query<{ id: string; canonical: string }>(
        "insert into core.entities (kind, canonical, mention_count, name_count) values ('party', 'SWAP ONE', 1, 1), ('party', 'SWAP TWO', 1, 1) returning id::text as id, canonical",
      );
      const [one, two] = rows;

      const plan = {
        keep: [
          { id: Number(one.id), cluster: cluster("party", "SWAP TWO") },
          { id: Number(two.id), cluster: cluster("party", "SWAP ONE") },
        ],
        insert: [],
        merge: [],
        drop: [],
      };
      await entityResolution.applyResolution(tx, plan);

      const after = await tx.query<{ id: string; canonical: string }>(
        "select id::text as id, canonical from core.entities where id = any($1::bigint[]) order by id",
        [[one.id, two.id]],
      );
      expect(after.rows.map((row) => row.canonical)).toEqual(["SWAP TWO", "SWAP ONE"]);
    });
  });

  it("drops a thing nothing reads any more, and keeps the ones still read", async () => {
    await inRollback(async (tx) => {
      await seedInbox(tx);
      const acme = await idOf(tx, ACME_ME);
      const { rows } = await tx.query<{ id: string }>(
        "insert into core.entities (kind, canonical, mention_count, name_count) values ('party', 'GONE TRADING LLC', 0, 0) returning id::text as id",
      );

      await refresh(tx);

      const left = await tx.query<{ n: string }>("select count(*)::text as n from core.entities where id = $1::bigint", [rows[0].id]);
      expect(left.rows[0].n).toBe("0");
      expect(await idOf(tx, ACME_ME)).toBe(acme);
    });
  });
});
