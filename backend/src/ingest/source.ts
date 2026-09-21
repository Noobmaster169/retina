import { z } from "zod";

/** One email exactly as an inbox hands it over. */
export const EmailRecord = z.object({
  email_id: z.string().min(1),
  from: z.string(),
  subject: z.string(),
  body: z.string(),
  attachments: z.array(z.string()),
  /**
   * Each attachment's size, positionally, where the inbox states one.
   *
   * Optional because an inbox may not, and the gate must still price an email
   * it cannot measure: pipeline/gate/cost.ts assumes a size rather than zero,
   * so "do not report a size" is not the cheapest way in. A real mail
   * connector reads it from the MIME part headers without downloading anything.
   */
  attachment_bytes: z.array(z.number().nullable()).optional(),
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
