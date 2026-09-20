import type { IconName } from "@/components/ui/icons";
import type { ObjectType } from "@/lib/api/ontology-schemas";

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

/** The two resolved kinds, which are the only ones with an index of their own. */
export function isResolved(type: ObjectType): type is "port" | "party" {
  return type === "port" || type === "party";
}

/** An id set in mono: the things that are identifiers rather than names. */
export function isMono(type: ObjectType): boolean {
  return type === "email" || type === "document" || type === "comparison" || type === "difference" || type === "run";
}
