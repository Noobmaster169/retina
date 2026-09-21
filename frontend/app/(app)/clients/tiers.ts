import type { ClientKind } from "@/lib/api/clients-schemas";

/**
 * What a tier is called on screen, and which way a slider for it runs.
 *
 * Wording, not contract: the api knows 1 to 5 and nothing about these words,
 * so they live with the page rather than in the file whose job is mirroring
 * the backend.
 */
export const TIERS: { tier: number; label: string }[] = [
  { tier: 1, label: "First" },
  { tier: 2, label: "High" },
  { tier: 3, label: "Normal" },
  { tier: 4, label: "Low" },
  { tier: 5, label: "Last" },
];

/** The fastest and slowest a sender can be served. The api's own range. */
export const FASTEST_TIER = 1;
export const SLOWEST_TIER = 5;

/**
 * The slider runs the opposite way to the tier, and that is the point of it.
 *
 * Tier 1 is served first, so the stored number falls as urgency rises. A
 * control where dragging right made the number smaller would be a control
 * where dragging right looked like less. So the handle's position is how
 * quickly this sender is served, rising to the right, and the tier is derived
 * from it. Nobody reading the screen ever sees the number.
 */
export function positionOf(tier: number): number {
  return SLOWEST_TIER + FASTEST_TIER - clampTier(tier);
}

export function tierAt(position: number): number {
  return SLOWEST_TIER + FASTEST_TIER - clampTier(position);
}

export function labelOf(tier: number): string {
  return TIERS.find((one) => one.tier === clampTier(tier))?.label ?? "Normal";
}

function clampTier(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(Math.max(Math.round(value), FASTEST_TIER), SLOWEST_TIER);
}

/** The kinds in the order the selector offers them. `spam` is last because it is the one nothing reads. */
export const KINDS: ClientKind[] = ["customer", "internal", "forwarder", "spam"];
