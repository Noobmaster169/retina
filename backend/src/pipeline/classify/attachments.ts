export interface AttachmentText {
  filename: string;
  /** Null when the parser could not read the file. */
  text: string | null;
  scanned: boolean;
  warnings: string[];
}

const CUT_MARKER = "[the text was cut here for length]";

/**
 * The attachments as a classifier that reads them sees them: each file's name
 * and the text the parser recovered, cut at the cap. Nothing is stripped or
 * normalised, for the same reason the body is not. A file the parser could
 * not read is named and said to be unreadable, with the parser's reason.
 */
export function describeAttachments(files: AttachmentText[], maxCharsEach: number): string {
  if (files.length === 0) return "(none)";
  return files
    .map((file) => {
      if (file.text === null) return `### ${file.filename}\n(unreadable: ${file.warnings.join("; ") || "no text could be recovered"})`;
      const note = file.scanned ? " (text recovered by OCR from a scanned page)" : "";
      const cut = file.text.length > maxCharsEach;
      const text = cut ? `${file.text.slice(0, maxCharsEach)}\n${CUT_MARKER}` : file.text;
      return `### ${file.filename}${note}\n${text}`;
    })
    .join("\n\n");
}
