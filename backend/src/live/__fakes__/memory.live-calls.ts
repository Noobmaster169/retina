import type { LiveCall, LiveCalls } from "../live-calls";

/** In memory, and it keeps every write so a test can see what a viewer would have seen. */
export class MemoryLiveCalls implements LiveCalls {
  readonly writes: LiveCall[] = [];
  private readonly current = new Map<string, LiveCall>();

  async put(call: LiveCall): Promise<void> {
    this.writes.push(call);
    this.current.set(call.emailRunId, call);
  }

  async clear(emailRunId: string): Promise<void> {
    this.current.delete(emailRunId);
  }

  async get(emailRunIds: string[]): Promise<LiveCall[]> {
    return emailRunIds.flatMap((id) => {
      const call = this.current.get(id);
      return call ? [call] : [];
    });
  }

  async close(): Promise<void> {}
}
