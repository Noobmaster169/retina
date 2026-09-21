import { describe, expect, it } from "vitest";

import { lanes } from "../../src/ontology/repositories";
import { inRollback } from "../db";

/** A lane is a pair on one shipment row; a merged port is followed to its survivor because the merge repointed the row. */
describe("lanes", () => {
  it("counts each pair of live ports across shipments, busiest first, with the disputed ones counted", async () => {
    await inRollback(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `insert into core.entities (kind, canonical, mention_count, name_count)
         values ('port', 'PORT A', 3, 1), ('port', 'PORT B', 3, 1), ('port', 'PORT C', 1, 1) returning id::text as id`,
      );
      const [a, b, c] = rows.map((row) => row.id);
      await tx.query(
        `insert into core.emails (email_id, from_addr, sender_domain, subject, body, raw)
         values ('lane_1', 'a@x', 'x', 's', 'b', '{}'), ('lane_2', 'a@x', 'x', 's', 'b', '{}'), ('lane_3', 'a@x', 'x', 'y', 'b', '{}'), ('lane_4', 'a@x', 'x', 'y', 'b', '{}')`,
      );
      await tx.query(
        `insert into core.email_shipments (email_id, pol_id, pod_id, disputed_fields) values
           ('lane_1', $1::bigint, $2::bigint, '{}'),
           ('lane_2', $1::bigint, $2::bigint, '{port_of_discharge}'),
           ('lane_3', $2::bigint, $3::bigint, '{}'),
           ('lane_4', $1::bigint, null, '{}')`,
        [a, b, c],
      );

      const seen = (await lanes.list(tx)).filter((lane) => [a, b, c].includes(lane.pol.id));
      expect(seen).toEqual([
        { pol: { id: a, name: "PORT A" }, pod: { id: b, name: "PORT B" }, count: 2, disputed: 1 },
        { pol: { id: b, name: "PORT B" }, pod: { id: c, name: "PORT C" }, count: 1, disputed: 0 },
      ]);
    });
  });
});
