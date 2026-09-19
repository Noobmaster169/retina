/** Where everything lives in the bucket. Nothing else builds a key. */
export const keys = {
  attachment: (runId: string, emailId: string, filename: string) =>
    `runs/${runId}/emails/${emailId}/attachments/${filename}`,
  submission: (runId: string, timestamp: string) => `submissions/${runId}/${timestamp}.json`,
};
