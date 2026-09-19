import { describe, expect, it } from "vitest";

import { jobId, resumeJobId, runIdOfJob } from "../../src/lib/ids";
import { ClassifyJob, CompareJob, IngestJob, ingestJobOptions, jobOptions } from "../../src/queues/names";

const RUN = "3f2c1b0a-9d8e-4f7a-8b6c-5d4e3f2a1b0c";

describe("job ids", () => {
  it("joins run and email without a colon, which BullMQ rejects in custom ids", () => {
    expect(jobId(RUN, "email_004")).toBe(`${RUN}__email_004`);
    expect(jobId(RUN, "email_004")).not.toContain(":");
    expect(resumeJobId(RUN, 2)).toBe(`${RUN}__resume__2`);
  });

  it("recovers the run id from any job id of that run", () => {
    expect(runIdOfJob(jobId(RUN, "email_004"))).toBe(RUN);
    expect(runIdOfJob(resumeJobId(RUN, 1))).toBe(RUN);
    expect(runIdOfJob(RUN)).toBe(RUN);
  });
});

describe("jobOptions", () => {
  it("is idempotent by id, retried three times with backoff, and kept when it fails", () => {
    expect(jobOptions(RUN, "email_004", 600)).toEqual({
      jobId: `${RUN}__email_004`,
      priority: 600,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 86_400 },
      removeOnFail: false,
    });
  });

  it("gives the ingest job the id it is handed and no priority", () => {
    expect(ingestJobOptions(RUN)).toMatchObject({ jobId: RUN, attempts: 3 });
    expect(ingestJobOptions(RUN)).not.toHaveProperty("priority");
  });
});

describe("job payloads", () => {
  it("carry ids only", () => {
    expect(ClassifyJob.parse({ runId: RUN, emailId: "email_004" })).toEqual({ runId: RUN, emailId: "email_004" });
    expect(CompareJob.parse({ runId: RUN, emailId: "email_004", rerunFrom: "extract" }).rerunFrom).toBe("extract");
  });

  it("an ingest job added before epochs existed reads as epoch 0", () => {
    expect(IngestJob.parse({ runId: RUN })).toEqual({ runId: RUN, epoch: 0 });
    expect(IngestJob.parse({ runId: RUN, epoch: 3 }).epoch).toBe(3);
    expect(IngestJob.safeParse({ runId: RUN, epoch: -1 }).success).toBe(false);
  });

  it("reject a run id that is not a uuid", () => {
    expect(ClassifyJob.safeParse({ runId: "nope", emailId: "email_004" }).success).toBe(false);
    expect(CompareJob.safeParse({ runId: RUN, emailId: "email_004", rerunFrom: "later" }).success).toBe(false);
  });
});
