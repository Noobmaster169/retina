import type { Lane } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * Every lane the shipments state, busiest first: what the port map draws
 * between two pins.
 *
 * Read off `core.email_shipments` rather than the appearances view, because a
 * lane is one email's loading port beside its discharge port, and only the
 * shipment row holds the two as a pair. A merge repoints these columns, so
 * every id here is a live thing.
 */

interface Row {
  pol_id: string;
  pol_name: string;
  pod_id: string;
  pod_name: string;
  n: string;
  disputed: string;
}

export async function list(db: Queryable): Promise<Lane[]> {
  const { rows } = await db.query<Row>(
    `select pol.id::text as pol_id, pol.canonical as pol_name, pod.id::text as pod_id, pod.canonical as pod_name,
            count(*)::text as n,
            count(*) filter (where s.disputed_fields && array['port_of_loading', 'port_of_discharge'])::text as disputed
       from core.email_shipments s
       join core.entities pol on pol.id = s.pol_id and pol.merged_into is null
       join core.entities pod on pod.id = s.pod_id and pod.merged_into is null
      where s.pol_id <> s.pod_id
      group by pol.id, pol.canonical, pod.id, pod.canonical
      order by count(*) desc, pol.canonical asc, pod.canonical asc`,
  );
  return rows.map((row) => ({
    pol: { id: row.pol_id, name: row.pol_name },
    pod: { id: row.pod_id, name: row.pod_name },
    count: Number(row.n),
    disputed: Number(row.disputed),
  }));
}
