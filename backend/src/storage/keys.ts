/** Where everything lives in the bucket. Nothing else builds a key. */
export const keys = {
  attachment: (runId: string, emailId: string, filename: string) =>
    `runs/${runId}/emails/${emailId}/attachments/${filename}`,
  text: (runId: string, emailId: string, filename: string) => `runs/${runId}/emails/${emailId}/text/${filename}.txt`,
  page: (runId: string, emailId: string, filename: string, n: number) =>
    `runs/${runId}/emails/${emailId}/pages/${filename}/${n}.png`,
  upload: (caseId: string, filename: string) => `uploads/${caseId}/${filename}`,
  submission: (runId: string, timestamp: string) => `submissions/${runId}/${timestamp}.json`,
};
