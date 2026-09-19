export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Rejects if `work` has not settled within `ms`. */
export async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
