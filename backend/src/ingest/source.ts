import { z } from "zod";

/** One email exactly as an inbox hands it over. */
export const EmailRecord = z.object({
  email_id: z.string().min(1),
  from: z.string(),
  subject: z.string(),
  body: z.string(),
  attachments: z.array(z.string()),
});
export type EmailRecord = z.infer<typeof EmailRecord>;

export interface AttachmentBytes {
  bytes: Buffer;
  contentType: string;
}

/** An inbox the pipeline can replay. Averis today; Gmail is another implementation, not another pipeline. */
export interface Source {
  listEmailIds(): Promise<string[]>;
  getEmail(id: string): Promise<EmailRecord>;
  /** `path` is an entry of `EmailRecord.attachments`. */
  readAttachment(path: string): Promise<AttachmentBytes>;
}
