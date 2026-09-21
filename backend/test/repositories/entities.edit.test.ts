import { describe, expect, it } from "vitest";

import { entities, entityDetail, entityEdit, entityInputs, entityProfile, entityResolution } from "../../src/ontology/repositories";
import { EditRefused } from "../../src/ontology/repositories/entities.edit";
import { reconcile, resolveEntities } from "../../src/pipeline/ontology";
import { ACME_FE, ACME_ME, NORTHWIND, seedInbox } from "../chat-seed";
import { inRollback } from "../db";

/** The resolver as production runs it, over whatever the transaction can see. */
async function resolveAgain(tx: Parameters<Parameters<typeof inRollback>[0]>[0]): Promise<void> {
  const [mentions, verdicts, joins, sightings, existing] = await Promise.all([
    entityInputs.loadMentions(tx),
    entityInputs.loadVerdicts(tx),
    entityInputs.loadResolveJoins(tx),
    entityInputs.loadSightings(tx),
    entityInputs.loadExisting(tx),
  ]);
  await entityResolution.applyResolution(tx, reconcile(resolveEntities(mentions, [...verdicts, ...joins], sightings), existing));
}

describe("a person's edits", () => {
  it("sets attributes with source human, which a profile rewrite keeps", async () => {
    await inRollback(async (tx) => {
      const inbox = await seedInbox(tx);
      const id = inbox.idOf(NORTHWIND);
      await entityEdit.setAttributes(tx, "party", id, { country: "Lemuria", countryCode: "LM" }, "a reviewer");
      await entityProfile.write(tx, id, {
        markdown: "# x", searchText: "x",
        attributes: { country: "Somewhere Else", city: null, kind: "distributor", sector: null, group: null },
        attributeSources: { country: { source: "model", confidence: 0.5, llmCallId: null }, kind: { source: "model", confidence: 0.5, llmCallId: null } },
      });
      const stored = await entityProfile.read(tx, id);
      expect(stored?.attributes).toMatchObject({ country: "Lemuria", countryCode: "LM", kind: "distributor" });
      expect(stored?.attributeSources.country).toMatchObject({ source: "human" });
      expect((await entities.find(tx, id))?.attributes.country).toBe("Lemuria");
    });
  });

  it("renames a thing, and the next resolution pass keeps the chosen name", async () => {
    await inRollback(async (tx) => {
      const inbox = await seedInbox(tx);
      const id = inbox.idOf(NORTHWIND);
      await entityEdit.rename(tx, "party", id, "Northwind Stationery", "a reviewer");
      expect((await entities.find(tx, id))?.name).toBe("Northwind Stationery");
      await resolveAgain(tx);
      expect((await entities.find(tx, id))?.name).toBe("Northwind Stationery");
      const names = await entityDetail.names(tx, id);
      expect(names.some((name) => name.value === "Northwind Stationery" && name.joinedBy === "human")).toBe(true);
    });
  });

  it("refuses a name another live thing of the kind already has", async () => {
    await inRollback(async (tx) => {
      const inbox = await seedInbox(tx);
      await expect(entityEdit.rename(tx, "party", inbox.idOf(NORTHWIND), ACME_ME, "a reviewer")).rejects.toBeInstanceOf(EditRefused);
    });
  });

  it("merges one thing into another, and the next resolution pass keeps them together", async () => {
    await inRollback(async (tx) => {
      const inbox = await seedInbox(tx);
      const from = inbox.idOf(ACME_FE);
      const into = inbox.idOf(ACME_ME);
      const before = await entityDetail.appearanceCount(tx, into);
      await entityEdit.mergeInto(tx, "party", from, into, "a reviewer");
      expect(await entities.find(tx, from)).toBeNull();
      const names = await entityDetail.names(tx, into);
      expect(names.some((name) => name.value === ACME_FE && name.joinedBy === "human")).toBe(true);
      expect(await entityDetail.appearanceCount(tx, into)).toBeGreaterThan(before);

      await resolveAgain(tx);
      const survivor = await entities.find(tx, into);
      expect(survivor?.name).toBe(ACME_ME);
      const parties = await entities.listByKind(tx, "party");
      expect(parties.some((row) => row.name === ACME_FE)).toBe(false);
      expect((await entityDetail.names(tx, into)).some((name) => name.value === ACME_FE)).toBe(true);
    });
  });
});

describe("locating at resolution", () => {
  it("places a port the reference list knows the moment it is inserted from a sighting", async () => {
    await inRollback(async (tx) => {
      const id = await entityResolution.insertFromSighting(tx, "port", "KARACHI, PAKISTAN (PKKHI)", new Date());
      const stored = await entityProfile.read(tx, String(id));
      expect(stored?.attributes).toMatchObject({ country: "Pakistan", countryCode: "PK", region: "Asia", subregion: "Southern Asia" });
      expect(Number(stored?.attributes.lat)).toBeCloseTo(24.8, 0);
      expect(stored?.attributeSources.lat).toMatchObject({ source: "reference" });
      expect((await entityLocate_unlocated(tx)).some((row) => row.id === String(id))).toBe(false);
    });
  });

  it("offers a port it has already placed again under --all, so a fix to the lookup reaches it", async () => {
    await inRollback(async (tx) => {
      const id = await entityResolution.insertFromSighting(tx, "port", "KARACHI, PAKISTAN (PKKHI)", new Date());
      expect((await entityLocate_unlocated(tx)).some((row) => row.id === String(id))).toBe(false);
      expect((await entityLocate_unlocated(tx, true)).some((row) => row.id === String(id))).toBe(true);
    });
  });

  it("leaves an attribute a person settled alone when it places the port again", async () => {
    await inRollback(async (tx) => {
      const { entityLocate } = await import("../../src/ontology/repositories");
      const id = String(await entityResolution.insertFromSighting(tx, "port", "KARACHI, PAKISTAN (PKKHI)", new Date()));
      await entityEdit.setAttributes(tx, "port", id, { country: "Lemuria" }, "a reviewer");

      expect(await entityLocate.locateEntity(tx, id, "port", "KARACHI, PAKISTAN (PKKHI)")).toBe(true);
      const stored = await entityProfile.read(tx, id);
      expect(stored?.attributes.country).toBe("Lemuria");
      expect(stored?.attributeSources.country).toMatchObject({ source: "human" });
      // Everything the person did not touch is still the reference list's.
      expect(stored?.attributes.countryCode).toBe("PK");
      expect(stored?.attributeSources.countryCode).toMatchObject({ source: "reference" });
    });
  });
});

async function entityLocate_unlocated(tx: Parameters<Parameters<typeof inRollback>[0]>[0], again = false) {
  const { entityLocate } = await import("../../src/ontology/repositories");
  return entityLocate.unlocated(tx, again);
}
