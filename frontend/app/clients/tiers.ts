import type { ClientKind } from "@/lib/api/clients-schemas";

/**
 * What a tier is called on screen. Wording, not contract: the api knows 1 to
 * 5 and nothing about these words, so they live with the page rather than in
 * the file whose job is mirroring the backend.
 */
export const TIERS: { tier: number; label: string }[] = [
  { tier: 1, label: "First" },
  { tier: 2, label: "High" },
  { tier: 3, label: "Normal" },
  { tier: 4, label: "Low" },
  { tier: 5, label: "Last" },
];

/** The kinds in the order the selector offers them. `spam` is last because it is the one nothing reads. */
export const KINDS: ClientKind[] = ["customer", "internal", "forwarder", "spam"];
