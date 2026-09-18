/** Applies every pending migration in filename order. Returns the ones it applied. */
export function migrate(options?: { log?: (message: string) => void }): Promise<string[]>;
