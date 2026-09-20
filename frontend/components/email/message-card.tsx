import { Icon } from "@/components/ui/icons";

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

/** The sender's own words, as they arrived. Nothing here is stripped, cleaned or summarised. */
export function MessageCard({ message, to = "ops@aprilasia.com" }: { message: Message; to?: string }) {
  return (
    <article className="overflow-hidden rounded-lg border border-hairline-strong">
      <header className="flex items-center gap-2.5 border-b border-hairline bg-surface px-3.5 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-hairline bg-canvas text-[10.5px] font-semibold text-ink-secondary">
          {initials(message.from)}
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
                <span className="min-w-0 truncate font-mono text-micro">{basename(path)}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** The same message folded to one line, for the documents view where the two documents take the width. */
export function MessageStrip({ message, onOpen }: { message: Message; onOpen?: () => void }) {
  return (
    <div className="flex h-[42px] shrink-0 items-center gap-2.5 border-b border-hairline bg-surface px-[22px]">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-hairline bg-canvas text-[9.5px] font-semibold text-ink-secondary">
        {initials(message.from)}
      </span>
      <span className="shrink-0 text-small text-ink-secondary">{senderName(message.from)}</span>
      <span className="min-w-0 truncate text-small text-ink-tertiary">{firstLine(message.body)}</span>
      <span className="grow" />
      {onOpen ? (
        <button type="button" onClick={onOpen} className="shrink-0 text-small text-ink-secondary hover:underline">
          Show the message
        </button>
      ) : null}
    </div>
  );
}

function senderAddress(from: string): string {
  return from.match(/<([^>]+)>/)?.[1] ?? from;
}

function senderName(from: string): string {
  const named = from.match(/^\s*"?([^"<]+?)"?\s*</);
  if (named) return named[1];
  const [local] = senderAddress(from).split("@");
  return local.replace(/[._-]+/g, " ");
}

function initials(from: string): string {
  const words = senderName(from).split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "?").concat(words[1]?.[0] ?? "").toUpperCase();
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function firstLine(body: string): string {
  return body.trim().split("\n")[0] ?? "";
}
