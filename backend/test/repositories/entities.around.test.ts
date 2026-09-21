import { describe, expect, it } from "vitest";

import { entities, entityAround } from "../../src/ontology/repositories";
import { ACME_ME, ALPHA, BETA, NORTHWIND, seedInbox } from "../chat-seed";
import { inRollback } from "../db";

describe("a kind's list", () => {
  it("carries each thing's roles as distinct emails", async () => {
    await inRollback(async (tx) => {
      const inbox = await seedInbox(tx);
      const parties = await entities.listByKind(tx, "party");
      const northwind = parties.find((row) => row.id === inbox.idOf(NORTHWIND));
      expect(northwind?.roles.consignee).toBe(2);
      expect(northwind?.roles.notify_party).toBe(2);
      expect(northwind?.attributes).toEqual({});
      expect(northwind?.summary).toBeNull();
    });
  });

  it("reads the profile's first sentence as the summary", async () => {
    await inRollback(async (tx) => {
      const inbox = await seedInbox(tx);
      await tx.query("update core.entities set profile_md = $2 where id = $1::bigint", [
        inbox.idOf(NORTHWIND),
        "# NORTHWIND STATIONERY LLC\nA party.\n\nA stationery distributor. A consignee on 3 emails.\n\n## What our mail shows\nmore",
      ]);
      const row = (await entities.listByKind(tx, "party")).find((entry) => entry.id === inbox.idOf(NORTHWIND));
      expect(row?.summary).toBe("A stationery distributor. A consignee on 3 emails.");
    });
  });
});

describe("entityAround", () => {
  it("names the ports a company ships through, and the companies using a port", async () => {
    await inRollback(async (tx) => {
      const inbox = await seedInbox(tx);
      const ports = await entityAround.ports(tx, inbox.idOf(ACME_ME));
      expect(ports.map((port) => [port.name, port.count])).toEqual([
        [BETA, 2],
        [ALPHA, 2],
      ]);
      const parties = await entityAround.parties(tx, inbox.idOf(BETA));
      expect(parties.find((party) => party.name === NORTHWIND)?.count).toBe(2);
      expect(await entityAround.people(tx, inbox.idOf(ACME_ME))).toEqual([]);
    });
  });
});
