/** Where everything lives in the bucket. Nothing else builds a key. */
export const keys = {
  attachment: (runId: string, emailId: string, filename: string) =>
    `runs/${runId}/emails/${emailId}/attachments/${filename}`,
  /** The extracted text of one attachment, written by the worker after doc-extract answers. */
  text: (runId: string, emailId: string, filename: string) => `runs/${runId}/emails/${emailId}/text/${filename}.txt`,
  /** The prefix doc-extract writes a PDF's page images under, one `{n}.png` each. */
  pages: (runId: string, emailId: string, filename: string) => `runs/${runId}/emails/${emailId}/pages/${filename}`,
  /** A document a reviewer supplied, under the case that asked for it. */
  upload: (caseId: string, filename: string) => `uploads/${caseId}/${filename}`,
  submission: (runId: string, timestamp: string) => `submissions/${runId}/${timestamp}.json`,
};
