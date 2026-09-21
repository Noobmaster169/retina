import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * The answer's prose, as Markdown. The prompt asks for structure only where
 * the answer has parts, so most answers are a paragraph and this draws them
 * as one; a list, a bold figure or a heading is drawn in the product's own
 * type rather than the browser's defaults.
 */

const parts: ComponentProps<typeof ReactMarkdown>["components"] = {
  p: ({ children }) => <p className="text-body leading-[21px] text-ink">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h3 className="mt-1 text-heading font-semibold text-ink">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-1 text-heading font-semibold text-ink">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-1 text-strong font-medium text-ink">{children}</h4>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 text-body leading-[21px] text-ink marker:text-ink-faint">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 text-body leading-[21px] text-ink marker:text-ink-tertiary">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  code: ({ children }) => <code className="rounded-xs bg-sunken px-1 font-mono text-mono-sm text-ink-secondary">{children}</code>,
  a: ({ children, href }) => (
    <a href={href} className="text-accent underline-offset-2 hover:underline">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-small">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-hairline-strong px-2 py-1 text-left text-caption font-medium text-ink-tertiary">{children}</th>,
  td: ({ children }) => <td className="border-b border-hairline-faint px-2 py-1 align-top">{children}</td>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-hairline-strong pl-3 text-ink-secondary">{children}</blockquote>,
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="max-w-[72ch] space-y-2.5">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={parts}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
