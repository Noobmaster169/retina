import { Icon } from "@/components/ui/icons";

import { senderAddress, senderInitials, senderName } from "./sender";

/**
 * The email, walled off. This is the only bordered card in the product, and
 * the border is not decoration: the whole design problem on this page was that
 * a reader could not tell where the sender stopped and Retina started. A border
 * that means "this is not ours" earns its place.
 *
 * docs/05-design.md section 6, and the seam in seam.tsx directly under it.
 */

export interface Message {
  from: string;
  subject: string;
  body: string;
  /** Paths as the email server stores them: "attachments/email_004_SI.txt". */
  attachments: string[];
}

/** How big each file turned out to be, by name. The parser knows; the inbox does not. */
export type FileSizes = Record<string, number>;

function size(bytes: number | undefined): string | null {
  if (bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The sender's own words, as they arrived. Nothing here is stripped, cleaned or summarised. */
export function MessageCard({ message, sizes = {}, to = "ops@aprilasia.com" }: { message: Message; sizes?: FileSizes; to?: string }) {
  return (
    <article className="overflow-hidden rounded-lg border border-hairline-strong">
      <header className="flex items-center gap-2.5 border-b border-hairline bg-surface px-3.5 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-hairline bg-canvas text-[10.5px] font-semibold text-ink-secondary">
          {senderInitials(message.from)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-strong font-medium">{senderName(message.from)}</span>
          <span className="block text-caption text-ink-tertiary">
            {senderAddress(message.from)} to {to}
          </span>
        </span>
      </header>
      <div className="px-3.5 py-3.5">
        <p className="max-w-[68ch] text-body text-ink-secondary">{message.body.trim()}</p>
        {message.attachments.length > 0 ? (
          <div className="mt-3 flex gap-2">
            {message.attachments.map((path) => (
              <span
                key={path}
                className="flex min-w-0 shrink grow basis-0 items-center gap-2 rounded-md border border-hairline px-2.5 py-2"
              >
                <Icon name="doc" size={14} className="shrink-0 text-ink-faint" />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-micro">{basename(path)}</span>
                  {size(sizes[basename(path)]) ? (
                    <span className="block text-micro text-ink-tertiary">{size(sizes[basename(path)])}</span>
                  ) : null}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}
