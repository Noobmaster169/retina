/**
 * One email's work inside one run: the run it belongs to, the email it is, and
 * the `email_runs` row that joins them. Every processor, and everything a
 * processor hands its ids to, takes this one shape.
 */
export interface EmailRunIds {
  runId: string;
  emailId: string;
  emailRunId: string;
}
