import type { JobsOptions } from "bullmq";

import type { JobAdder } from "../names";

/** Remembers every add, and like BullMQ ignores a second add with the same job id. */
export class RecordingAdder<T> implements JobAdder<T> {
  readonly added: { name: string; data: T; options: JobsOptions }[] = [];

  async add(name: string, data: T, options: JobsOptions): Promise<void> {
    if (options.jobId && this.added.some((job) => job.options.jobId === options.jobId)) return;
    this.added.push({ name, data, options });
  }
}
