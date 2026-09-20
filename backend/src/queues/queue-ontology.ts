import { emailRuns } from "../ontology/repositories";
import { childLogger } from "../lib/logger";
import { type CompareJob, JOB_NAMES, type JobAdder, type OntologyJob, ontologyJobOptions } from "./names";
import type { Queryable } from "../db";

const log = childLogger({ module: "queue-ontology" });

/**
 * The semantic layer picks an email up once its verdict is written.
 *
 * Here and not inside the compare processor because the processor writes
 * `done` and `review` from four different branches, and one place that reads
 * the stage the email actually reached cannot miss one of them. A queue that
 * will not take the job is logged and dropped: the reading is worth having and
 * never worth failing a compared email over.
 */
export async function queueOntology(deps: OntologyProducer, data: CompareJob): Promise<void> {
  if (!deps.ontology) return;
  try {
    const emailRunId = await emailRuns.idOf(deps.pool, data.runId, data.emailId);
    if (!emailRunId) return;
    const context = await emailRuns.context(deps.pool, emailRunId);
    if (context?.stage !== "done" && context?.stage !== "review") return;
    await deps.ontology.add(JOB_NAMES.ontology, { emailId: data.emailId, emailRunId: Number(emailRunId) }, ontologyJobOptions(data.emailId));
  } catch (error) {
    log.warn({ ...data, err: error instanceof Error ? error.message : String(error) }, "could not queue the semantic reading");
  }
}

/** What queueing a reading needs, which is the pool and a queue that may be absent. */
export interface OntologyProducer {
  pool: Queryable;
  ontology?: JobAdder<OntologyJob>;
}
