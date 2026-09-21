/**
 * Runs `work` over `items` with at most `limit` in flight and returns the
 * results in the order of `items`.
 *
 * After one item fails no lane takes another, so a failed batch stops spending
 * what it was spending instead of finishing the list behind the error.
 */
export async function inParallel<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;

  async function lane(): Promise<void> {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await work(items[index]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

/**
 * One at a time, in the order asked. The returned function runs its work once
 * every earlier caller's has finished, whether that succeeded or threw.
 */
export function mutex(): <T>(work: () => Promise<T>) => Promise<T> {
  let locked = false;
  const waiting: (() => void)[] = [];

  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (locked) await new Promise<void>((resolve) => waiting.push(resolve));
    else locked = true;
    try {
      return await work();
    } finally {
      // Handed straight to the next caller, so `locked` never dips and lets a newcomer jump the line.
      const next = waiting.shift();
      if (next) next();
      else locked = false;
    }
  };
}
