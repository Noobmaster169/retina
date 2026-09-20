import { describe, expect, it } from "vitest";

import { bind, recipes } from "../../src/agents/chat/skills/recipes";
import { orientationFor } from "../../src/agents/chat/orientation";
import {
  chat, chatState, databaseProfile, emailSearch, entityOverview, entitySearch, orientation,
} from "../../src/ontology/repositories";
import { getRoPool } from "../../src/db";
import { ACME_FE, ACME_ME, ALPHA, BETA, GAMMA, NORTHWIND, seedInbox } from "../chat-seed";
import { inRollback } from "../db";

describe("finding a resolved thing", () => {
  it("puts an exact spelling first, then the same ignoring case, then the similar, and says which is which", async () => {
    await inRollback(async (tx) => {
      await seedInbox(tx);
      const exact = await entitySearch.findCandidates(tx, ACME_ME, null);
      expect(exact[0]).toMatchObject({ canonical: ACME_ME, how: "exact", kind: "party" });

      const cased = await entitySearch.findCandidates(tx, ACME_ME.toLowerCase(), null);
      expect(cased[0]).toMatchObject({ canonical: ACME_ME, how: "same ignoring case" });

      const partial = await entitySearch.findCandidates(tx, "Acme Paper Trading", null);
      expect(partial.map((candidate) => candidate.how)).toEqual(partial.map(() => "similar"));
      // A group word reaches every company of the group; choosing among them is the reader's.
      expect(new Set((await entitySearch.findCandidates(tx, "Acme", null)).map((c) => c.canonical))).toEqual(new Set([ACME_ME, ACME_FE]));
    });
  });

  it("keeps to the kind asked for, and finds nothing for a name that is nothing like any", async () => {
    await inRollback(async (tx) => {
      await seedInbox(tx);
      expect((await entitySearch.findCandidates(tx, "Lemuria", "port")).map((c) => c.canonical).sort()).toEqual([BETA, GAMMA]);
      expect(await entitySearch.findCandidates(tx, "Lemuria", "party")).toEqual([]);
      expect(await entitySearch.findCandidates(tx, "Qwxzj Vbnmk", null)).toEqual([]);
    });
  });

  it("counts an email replayed in a second run once", async () => {
    await inRollback(async (tx) => {
      const first = await seedInbox(tx);
      await seedInbox(tx, undefined, first.emailIds);
      const [alpha] = await entitySearch.findCandidates(tx, ALPHA, "port");
      expect(alpha.mentions).toBe(6);
      expect(alpha.emails).toBe(3);

      const thing = await entityOverview.overview(tx, alpha.id);
      expect(thing).toMatchObject({ canonical: ALPHA, emails: 3, runs: 2 });
      expect(thing?.byField).toEqual([{ field: "port_of_loading", mentions: 6, emails: 3 }]);
    });
  });

  it("lists a kind, and those with a spelling containing a word", async () => {
    await inRollback(async (tx) => {
      await seedInbox(tx);
      const all = await entitySearch.listing(tx, "port", null, 60);
      expect(all.total).toBeGreaterThanOrEqual(3);
      const lemuria = await entitySearch.listing(tx, "port", "lemuria", 60);
      expect(lemuria.rows.map((row) => row.canonical).sort()).toEqual([BETA, GAMMA]);
      expect(lemuria.total).toBe(2);
    });
  });

  it("knows a string that is exactly a stored name or identifier, and no other", async () => {
    await inRollback(async (tx) => {
      const seeded = await seedInbox(tx);
      const known = await entitySearch.knownValues(tx, [NORTHWIND, "Northwind", seeded.emailIds[0], "vitalsolutions.sg", "nobody.example"]);
      expect(new Set(known)).toEqual(new Set([NORTHWIND, seeded.emailIds[0], "vitalsolutions.sg"]));
    });
  });
});

describe("searching email text", () => {
  it("finds a hyphenated reference whole, a word in a body, and reports the sender domain a name resembles", async () => {
    await inRollback(async (tx) => {
      const seeded = await seedInbox(tx);
      await tx.query("update core.emails set subject = 'DOCS _ 9ZZZ-12345 _ SOMEWHERE', body = 'Please check vessel OCEAN HERON.' where email_id = $1", [seeded.emailIds[0]]);

      const byReference = await emailSearch.searchEmails(tx, "9ZZZ-12345", null, 10);
      expect(byReference.hits.map((hit) => hit.emailId)).toEqual([seeded.emailIds[0]]);
      expect((await emailSearch.searchEmails(tx, "9ZZZ-99999", null, 10)).total).toBe(0);
      expect((await emailSearch.searchEmails(tx, "ocean heron", seeded.runId, 10)).hits[0].snippet).toContain("[OCEAN]");

      const elsewhere = await emailSearch.elsewhere(tx, "Vital Solutions Pte Ltd");
      expect(elsewhere.senderDomains.map((domain) => domain.domain)).toContain("vitalsolutions.sg");
    });
  });
});

describe("profiling a column", () => {
  it("reports counts and the most frequent values", async () => {
    await inRollback(async (tx) => {
      await seedInbox(tx);
      const outcome = await databaseProfile.profileColumn(tx, "core.entities", "kind");
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.profile.top.map((row) => row.value).sort()).toEqual(["party", "port"]);
      expect(outcome.profile.rows).toBeGreaterThanOrEqual(7);
    });
  });

  it.each([
    { name: "a relation with no schema", relation: "emails", column: "subject", reason: /schema-qualified/ },
    { name: "another schema", relation: "pg_catalog.pg_authid", column: "rolpassword", reason: /only the core and analytics/ },
    { name: "a column that does not exist", relation: "core.emails", column: "nope", reason: /no column "nope"/ },
    { name: "an identifier that is really SQL", relation: "core.emails", column: 'subject"; drop table x; --', reason: /no column/ },
  ])("refuses $name", async ({ relation, column, reason }) => {
    const outcome = await inRollback((tx) => databaseProfile.profileColumn(tx, relation, column));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toMatch(reason);
  });
});

describe("the recipes against a seeded inbox", () => {
  it("emails_for_entities returns one run's emails once each, however many runs replayed them", async () => {
    await inRollback(async (tx) => {
      const first = await seedInbox(tx);
      // The second seed rebuilds the resolved things, so ids are read after it: an id does not survive a refresh.
      const second = await seedInbox(tx, undefined, first.emailIds);
      const recipe = recipes().get("emails_for_entities")!;
      const bound = bind(recipe, { entity_ids: [second.idOf(ALPHA)], run_id: first.runId });
      if (!bound.ok) throw new Error(bound.reason);
      const { rows } = await tx.query<{ email_id: string }>(recipe.sql, bound.values);
      expect(rows.map((row) => row.email_id).sort()).toEqual([...first.emailIds].sort());
    });
  });

  it("lanes and ports_by_role read the instruction's side and keep loading apart from discharge", async () => {
    await inRollback(async (tx) => {
      const seeded = await seedInbox(tx);
      const lanes = await tx.query<{ port_of_loading: string; port_of_discharge: string; emails: string }>(recipes().get("lanes")!.sql, [seeded.runId]);
      expect(lanes.rows.map((row) => [row.port_of_loading, row.port_of_discharge, Number(row.emails)])).toEqual([[ALPHA, BETA, 2], [ALPHA, GAMMA, 1]]);

      const roles = await tx.query<{ port: string; loading_emails: string; discharge_emails: string }>(recipes().get("ports_by_role")!.sql, [seeded.runId]);
      const alpha = roles.rows.find((row) => row.port === ALPHA);
      // An origin is never reported as a destination.
      expect([Number(alpha?.loading_emails), Number(alpha?.discharge_emails)]).toEqual([3, 0]);
    });
  });
});

describe("the orientation", () => {
  it("is computed once per conversation, kept, and computed again when the database moves", async () => {
    await inRollback(async (tx) => {
      const seeded = await seedInbox(tx);
      const conversation = await chat.create(tx, { actor: "a test", runId: seeded.runId });
      const db = { read: tx, write: tx };

      const first = await orientationFor(db, { id: conversation.id, runId: seeded.runId });
      expect(first).toContain(`This conversation is about run ${seeded.runId}`);
      expect(first).toContain(`[${seeded.idOf(ALPHA)}] ${ALPHA} (3 emails)`);
      expect((await chatState.orientationOf(tx, conversation.id))?.text).toBe(first);

      // Held: a second turn does not read the database again, so a marker written into the row comes straight back.
      const held = await chatState.orientationOf(tx, conversation.id);
      await chatState.setOrientation(tx, conversation.id, { ...held!, text: "kept" });
      expect(await orientationFor(db, { id: conversation.id, runId: seeded.runId })).toBe("kept");

      // The resolver rebuilding moves the watermark, and the next turn looks again.
      await tx.query("update core.entities set resolved_at = now() + interval '1 second'");
      expect(await orientationFor(db, { id: conversation.id, runId: seeded.runId })).toContain(ALPHA);
    });
  });

  it("falls back to the latest run for a conversation that names none", async () => {
    await inRollback(async (tx) => {
      const seeded = await seedInbox(tx);
      const snapshot = await orientation.snapshot(tx, null);
      expect(snapshot.run).toMatchObject({ id: seeded.runId, scoped: false, emails: 3 });
      expect(await orientation.latestRunId(tx)).toBe(seeded.runId);
    });
  });
});

describe("sticky skills", () => {
  it("are the ones loaded or picked earlier, not the ones the harness injected on an event", async () => {
    await inRollback(async (tx) => {
      const conversation = await chat.create(tx, { actor: "a test" });
      await chat.addAssistantTurn(tx, conversation.id, {
        answer: "an answer", sqlUsed: [], toolCalls: [], graph: null, proposal: null, reading: "", adhoc: false,
        skillsUsed: [
          { name: "time-questions", version: 1, how: "loaded" },
          { name: "ground-names", version: 1, how: "injected" },
          { name: "lanes-and-ports", version: 1, how: "picked" },
        ],
      });
      expect(await chatState.stickySkills(tx, conversation.id)).toEqual(["lanes-and-ports", "time-questions"]);
    });
  });
});

describe("as retina_ro, the role the chat reads as", () => {
  // The other tests read through a superuser's transaction so they can see what they seeded. That
  // hides a grant that is missing and a function that is off the role's search path, so every
  // fixed query the tools run is also run here, against whatever the test database holds.
  const ro = () => getRoPool()!;

  it("can run every lookup the tools make", async () => {
    await expect(entitySearch.findCandidates(ro(), "Acme Paper", null)).resolves.toBeInstanceOf(Array);
    await expect(entitySearch.listing(ro(), "port", "land", 10)).resolves.toHaveProperty("total");
    await expect(entitySearch.knownValues(ro(), ["x"])).resolves.toEqual([]);
    await expect(entityOverview.overview(ro(), "0")).resolves.toBeNull();
    await expect(emailSearch.searchEmails(ro(), "draft", null, 5)).resolves.toHaveProperty("total");
    await expect(emailSearch.elsewhere(ro(), "Vital Solutions")).resolves.toHaveProperty("senderDomains");
    await expect(databaseProfile.profileColumn(ro(), "core.emails", "sender_domain")).resolves.toHaveProperty("ok", true);
    await expect(orientation.snapshot(ro(), null)).resolves.toHaveProperty("watermark");
  });

  it("can profile a materialised view, which information_schema does not list", async () => {
    const outcome = await databaseProfile.profileColumn(ro(), "analytics.fact_email_outcome", "category");
    expect(outcome.ok).toBe(true);
  });

  it("cannot profile a column it was not granted", async () => {
    const outcome = await databaseProfile.profileColumn(ro(), "core.llm_calls", "request");
    expect(outcome.ok).toBe(false);
  });
});
