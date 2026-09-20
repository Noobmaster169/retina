import { Queue } from "bullmq";

import { getRedis } from "./connection";
import { type ClassifyJob, type CompareJob, type IngestJob, type OntologyWork, QUEUES } from "./names";

export interface Queues {
  ingest: Queue<IngestJob>;
  classify: Queue<ClassifyJob>;
  compare: Queue<CompareJob>;
  ontology: Queue<OntologyWork>;
}

let queues: Queues | undefined;

export function getQueues(): Queues {
  if (queues) return queues;
  const connection = getRedis();
  queues = {
    ingest: new Queue<IngestJob>(QUEUES.ingest, { connection }),
    classify: new Queue<ClassifyJob>(QUEUES.classify, { connection }),
    compare: new Queue<CompareJob>(QUEUES.compare, { connection }),
    ontology: new Queue<OntologyWork>(QUEUES.ontology, { connection }),
  };
  return queues;
}

export async function closeQueues(): Promise<void> {
  if (!queues) return;
  const closing = queues;
  queues = undefined;
  await Promise.all([closing.ingest.close(), closing.classify.close(), closing.compare.close(), closing.ontology.close()]);
}
