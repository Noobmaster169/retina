import type { IconName } from "@/components/ui/icons";
import type { EntityKind } from "@/lib/api/semantic-schemas";
import type { ObjectType } from "@/lib/api/ontology-schemas";

const RESOLVED = ["port", "party", "carrier", "person", "commodity", "vessel"] as const;

/**
 * One glyph per object type, shared by the graph, the rail and the link cards.
 *
 * The glyph carries the type and the colour does not, which is the rule
 * docs/design/ontology-patterns.md section 0 opens with: a table dense with
 * types stays readable because the shapes differ, and the hues stay free for
 * the three things that are actually a verdict.
 */
export const GLYPH_OF: Record<ObjectType, IconName> = {
  run: "clock",
  email: "mail",
  attachment: "clip",
  document: "doc",
  comparison: "scale",
  difference: "diff",
  field: "field",
  client: "client",
  port: "port",
  party: "party",
  shipment: "box",
  carrier: "ship",
  person: "client",
  commodity: "box",
  vessel: "ship",
};

/** Singular, for a chip beside one thing. The rail's plural labels come from the api. */
export const LABEL_OF: Record<ObjectType, string> = {
  run: "Run",
  email: "Email",
  attachment: "Attachment",
  document: "Document",
  comparison: "Comparison",
  difference: "Difference",
  field: "Field",
  client: "Client",
  port: "Port",
  party: "Party",
  shipment: "Shipment",
  carrier: "Carrier",
  person: "Person",
  commodity: "Commodity",
  vessel: "Vessel",
};

/** The resolved kinds, which are the ones with an index of their own. `shipment` is designed and not built. */
export function isResolved(type: ObjectType): type is EntityKind {
  return (RESOLVED as readonly ObjectType[]).includes(type);
}

/** An id set in mono: the things that are identifiers rather than names. */
export function isMono(type: ObjectType): boolean {
  return type === "email" || type === "document" || type === "comparison" || type === "difference" || type === "run";
}
