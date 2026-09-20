/**
 * Union-find over spellings.
 *
 * Split out of resolve.ts, which is about what a cluster means; this is only
 * the bookkeeping that puts two keys in the same set. Keys carry their kind,
 * so a party and a port written the same way never become one thing.
 */
export class Clusters {
  private readonly parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  has(key: string): boolean {
    return this.parent.has(key);
  }

  find(key: string): string {
    let root = key;
    while (this.parent.get(root) !== root) root = this.parent.get(root) as string;
    // Path compression, so a long chain of judged pairs stays cheap.
    let walk = key;
    while (walk !== root) {
      const next = this.parent.get(walk) as string;
      this.parent.set(walk, root);
      walk = next;
    }
    return root;
  }

  /** Joins two keys already added. Returns false when they were already one thing. */
  union(a: string, b: string): boolean {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return false;
    this.parent.set(rootA, rootB);
    return true;
  }
}
