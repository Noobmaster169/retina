export interface ClassifyEmail {
  from: string;
  subject: string;
  body: string;
}

export interface ClassifyInput {
  from: string;
  subject: string;
  attachments: string[];
  body: string;
}

const CUT_MARKER = "\n[the body was cut here for length]";

/**
 * What the model sees of one email. Everything is passed through as it
 * arrived: nothing is stripped, reordered or normalised, because deciding what
 * is boilerplate is reading the email, and reading the email is the model's
 * job. The only change is a length cap, which is a cost guard.
 */
export function buildClassifyInput(email: ClassifyEmail, attachmentNames: string[], maxBodyChars: number): ClassifyInput {
  const cut = email.body.length > maxBodyChars;
  return {
    from: email.from,
    subject: email.subject,
    attachments: attachmentNames,
    body: cut ? email.body.slice(0, maxBodyChars) + CUT_MARKER : email.body,
  };
}
