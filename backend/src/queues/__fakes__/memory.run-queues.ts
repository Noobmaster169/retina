import type { JobsOptions } from "bullmq";

import type { ClassifyJob } from "../names";
import type { RunQueues } from "../run-queues";

export class MemoryRunQueues implements RunQueues {
  readonly started: { runId: string; jobId: string; epoch: number }[] = [];
  readonly removedFor: string[] = [];
  readonly reruns: { queue: string; data: ClassifyJob; options: JobsOptions }[] = [];
  readonly released: { runId: string; emailId: string }[] = [];
  /** Set to make every call fail the way an unreachable Redis does. */
  failWith: Error | undefined;

  async startIngest(runId: string, jobId: string, epoch: number): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.started.push({ runId, jobId, epoch });
  }

  async counts() {
    if (this.failWith) throw this.failWith;
    const empty = { waiting: 0, active: 0, failed: 0 };
    return { classify: { ...empty }, compare: { ...empty } };
  }

  async rerun(queue: "classify" | "compare", data: ClassifyJob, options: JobsOptions): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.reruns.push({ queue, data, options });
  }

  async releaseEmail(runId: string, emailId: string): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.released.push({ runId, emailId });
  }

  async removeWaiting(runId: string): Promise<number> {
    if (this.failWith) throw this.failWith;
    this.removedFor.push(runId);
    return 0;
  }
}
