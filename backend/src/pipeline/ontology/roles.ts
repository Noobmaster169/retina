import type { ComparisonField, EntityKind } from "../../contracts";

/**
 * Where a thing was seen, and which kind of thing that makes it.
 *
 * One table, here, because three places need it: the reader that names a role,
 * the writer that stores a sighting, and the resolver that has no comparison
 * field to take a kind from. The roles are `core.entity_sightings.role`, value
 * for value.
 */

export const SIGHTING_ROLES = [
  "shipper", "on_behalf_of", "consignee", "notify_party",
  "port_of_loading", "port_of_discharge", "carrier", "vessel", "commodity",
  "sender", "signer", "addressee", "mentioned",
] as const;
export type SightingRole = (typeof SIGHTING_ROLES)[number];

const KIND_OF_ROLE: Record<SightingRole, EntityKind> = {
  shipper: "party",
  on_behalf_of: "party",
  consignee: "party",
  notify_party: "party",
  port_of_loading: "port",
  port_of_discharge: "port",
  carrier: "carrier",
  vessel: "vessel",
  commodity: "commodity",
  sender: "person",
  signer: "person",
  addressee: "person",
  mentioned: "party",
};

export function kindOfRole(role: SightingRole): EntityKind {
  return KIND_OF_ROLE[role];
}

/**
 * The five roles the extractor already reads out of documents.
 *
 * A value of one of these, read from a document, is a mention and not a
 * sighting: `core.entity_mentions` holds it with the extraction field it came
 * from, and storing it twice would double every count that reads the
 * appearances view. Read from a subject or a body it is new evidence, because
 * no extraction reaches there.
 */
export const EXTRACTED_ROLES: Record<string, ComparisonField> = {
  shipper: "shipper",
  consignee: "consignee",
  notify_party: "notify_party",
  port_of_loading: "port_of_loading",
  port_of_discharge: "port_of_discharge",
};

/** Which shipment column each role fills. A role that fills none is evidence and not a link. */
export const SHIPMENT_COLUMNS = {
  shipper: "shipper_id",
  consignee: "consignee_id",
  notify_party: "notify_party_id",
  port_of_loading: "pol_id",
  port_of_discharge: "pod_id",
  carrier: "carrier_id",
  vessel: "vessel_id",
  commodity: "commodity_id",
} as const;
export type ShipmentColumn = (typeof SHIPMENT_COLUMNS)[keyof typeof SHIPMENT_COLUMNS];
