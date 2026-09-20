import type { PriorityCache } from "../priority-cache";

/** The tiers a test wants the enqueue path to read, without a Redis. */
export class MemoryPriorityCache implements PriorityCache {
  readonly tiers = new Map<string, number>();
  /** Set to make every read fail the way an unreachable Redis does. The caller must still queue the email. */
  failWith: Error | undefined;

  constructor(tiers: Record<string, number> = {}) {
    for (const [domain, tier] of Object.entries(tiers)) this.tiers.set(domain, tier);
  }

  async tierOf(domain: string): Promise<number | null> {
    if (this.failWith) return null;
    return this.tiers.get(domain) ?? null;
  }

  async replaceAll(tiers: Map<string, number>): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.tiers.clear();
    for (const [domain, tier] of tiers) this.tiers.set(domain, tier);
  }

  async set(domain: string, tier: number): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.tiers.set(domain, tier);
  }
}
