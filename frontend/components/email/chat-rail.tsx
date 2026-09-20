"use client";

import { motion } from "motion/react";

import { Icon } from "@/components/ui/icons";
import { stagger } from "@/lib/motion";

/**
 * The 340px right pane, drawn and inert. It replaces the read only inspector
 * this design first specified: the argument that won was that a person looking
 * at a wrong verdict wants to say so, and a read only panel cannot take that
 * sentence.
 *
 * Phase 10 turns it on. Reserving the column now is the point, so the page is
 * not relaid out twice, and the composer says plainly why it will not take a
 * sentence yet rather than pretending to.
 */

export interface ChatScope {
  label: string;
  memory?: boolean;
}

interface ChatRailProps {
  scope: ChatScope[];
  /** What Retina found, in its own words. The turn the conversation would open with. */
  opening: string;
  /** What a person would most likely say next, drawn as the composer's suggestions. */
  suggestions: string[];
}

export function ChatRail({ scope, opening, suggestions }: ChatRailProps) {
  return (
    <aside className="flex w-[340px] shrink-0 flex-col bg-surface" aria-label="Ask Retina">
      <header className="flex h-16 shrink-0 items-center gap-2.5 border-b border-hairline px-[18px]">
        <Icon name="chat" size={15} className="text-ink" />
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Ask Retina</h2>
        <span className="grow" />
        <button
          type="button"
          disabled
          className="h-[26px] rounded-sm border border-hairline bg-canvas px-2.5 text-small text-ink-faint"
        >
          New
        </button>
      </header>

      <div className="flex h-[42px] shrink-0 items-center gap-1.5 overflow-hidden border-b border-hairline px-[18px]">
        <span className="shrink-0 text-micro text-ink-tertiary">Reading</span>
        {scope.map((item, index) => (
          <motion.span
            key={item.label}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={stagger(index)}
            className={`inline-flex h-[21px] shrink-0 items-center rounded-sm border border-hairline bg-canvas px-2 font-mono text-mono-xs ${
              item.memory ? "text-review" : "text-ink-secondary"
            }`}
          >
            {item.label}
          </motion.span>
        ))}
      </div>

      <div className="min-h-0 grow overflow-y-auto px-[18px] pt-3.5">
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="max-w-[268px] rounded-lg rounded-tl-xs border border-hairline bg-canvas px-2.5 py-2.5 text-small leading-[19px] text-ink-secondary"
        >
          {opening}
        </motion.div>
      </div>

      <div className="shrink-0 border-t border-hairline px-[18px] py-3">
        <div className="rounded-lg border border-hairline-strong bg-canvas px-2.5 py-2.5">
          <span className="block text-small text-ink-faint">Answering arrives in phase 10</span>
          <div className="mt-2 flex items-center gap-1.5">
            {suggestions.map((suggestion) => (
              <span
                key={suggestion}
                className="inline-flex h-[23px] items-center rounded-sm bg-sunken px-2 text-caption text-ink-faint"
              >
                {suggestion}
              </span>
            ))}
            <span className="grow" />
            <span
              className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-active"
              aria-hidden="true"
            >
              <Icon name="send" size={13} className="text-ink-faint" />
            </span>
          </div>
        </div>
        <p className="mt-2.5 text-micro leading-4 text-ink-tertiary">
          The column is reserved so the page is not relaid out when the chat lands. It will answer from this email,
          both documents, every model call it made, and what it has been taught.
        </p>
      </div>
    </aside>
  );
}
