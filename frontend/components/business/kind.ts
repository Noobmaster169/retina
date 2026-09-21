import type { IconName } from "@/components/ui/icons";

/**
 * The seven business objects, one table: what each is called, which glyph
 * and hue it carries, and where it opens. The hue says what a thing is and
 * never how it was judged: docs/05-design.md section 4.10.
 */

export type BusinessKind = "party" | "port" | "shipment" | "vessel" | "carrier" | "commodity" | "person";

export interface KindEntry {
  label: string;
  plural: string;
  icon: IconName;
  /** The token stem: `text-kind-company`, `bg-kind-company-tint`. */
  hue: string;
  /** The list route, or null for a kind that opens in the ontology. */
  route: string | null;
}

export const KINDS: Record<BusinessKind, KindEntry> = {
  party: { label: "Company", plural: "Companies", icon: "party", hue: "kind-company", route: "/company" },
  port: { label: "Port", plural: "Ports", icon: "port", hue: "kind-port", route: "/port" },
  shipment: { label: "Shipment", plural: "Shipments", icon: "ship", hue: "kind-shipment", route: "/shipment" },
  vessel: { label: "Vessel", plural: "Vessels", icon: "vessel", hue: "kind-vessel", route: null },
  carrier: { label: "Carrier", plural: "Carriers", icon: "carrier", hue: "kind-carrier", route: null },
  commodity: { label: "Commodity", plural: "Commodities", icon: "commodity", hue: "kind-commodity", route: null },
  person: { label: "Person", plural: "People", icon: "person", hue: "kind-person", route: null },
};

const FALLBACK: KindEntry = { label: "Thing", plural: "Things", icon: "box", hue: "kind-person", route: null };

export function kindOf(type: string): KindEntry {
  return (KINDS as Record<string, KindEntry>)[type] ?? FALLBACK;
}

export function hrefFor(type: string, id: string): string | null {
  const entry = kindOf(type);
  return entry.route ? `${entry.route}/${encodeURIComponent(id)}` : null;
}

/** Tailwind needs the class written out somewhere it can see it. */
export const HUE_CLASSES: Record<string, { text: string; tint: string; border: string }> = {
  "kind-company": { text: "text-kind-company", tint: "bg-kind-company-tint", border: "border-kind-company" },
  "kind-port": { text: "text-kind-port", tint: "bg-kind-port-tint", border: "border-kind-port" },
  "kind-shipment": { text: "text-kind-shipment", tint: "bg-kind-shipment-tint", border: "border-kind-shipment" },
  "kind-vessel": { text: "text-kind-vessel", tint: "bg-kind-vessel-tint", border: "border-kind-vessel" },
  "kind-carrier": { text: "text-kind-carrier", tint: "bg-kind-carrier-tint", border: "border-kind-carrier" },
  "kind-commodity": { text: "text-kind-commodity", tint: "bg-kind-commodity-tint", border: "border-kind-commodity" },
  "kind-person": { text: "text-kind-person", tint: "bg-kind-person-tint", border: "border-kind-person" },
};
