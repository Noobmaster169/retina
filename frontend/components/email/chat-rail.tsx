"use client";

import { Composer } from "@/components/chat/composer";
import { LiveSteps } from "@/components/chat/live-steps";
import { Turn } from "@/components/chat/turn";
import { useChat } from "@/components/chat/use-chat";
import { Icon } from "@/components/ui/icons";

/**
 * The 340px right pane, live.
 *
 * It replaces the read only inspector this design first specified: the
 * argument that won was that a person looking at a wrong verdict wants to say
 * so, and a read only panel cannot take that sentence.
 *
 * It is scoped to this email, and the chips say so. The scope is a default the
 * agent may widen when a question asks something wider, never a filter it
 * cannot see past, which is why "how often does this client differ" works here
 * and not only on the chat page.
 */

/** There are no accounts in this build; a reviewer types their name once. This is the rail's. */
const ACTOR = "the reviewer";

export interface ChatScope {
  label: string;
  memory?: boolean;
}

interface ChatRailProps {
  scope: ChatScope[];
  /** What Retina found, in its own words. The turn the conversation opens with. */
  opening: string;
  /** What a person would most likely say next, offered under the composer. */
  suggestions: string[];
  runId: string;
  emailId: string;
}

export function ChatRail({ scope, opening, suggestions, runId, emailId }: ChatRailProps) {
  // The conversation is opened by the first question, not by looking at the
  // email: a person who reads an email and says nothing should not leave an
  // empty conversation behind. Callers key this component on the email, so
  // moving to the next one starts a new thread rather than carrying the last
  // email's answers into it.
  const chat = useChat({
    conversationId: null,
    openWith: { actor: ACTOR, runId, emailId, title: `About ${emailId}` },
    actor: ACTOR,
    initial: [],
  });

  return (
    // Below 1280px the chat gives up its column: `05-design.md` section 7
    // makes it an overlay sheet at that width. A media query and not a tab, so
    // switching a tab still never moves the panes.
    <aside className="hidden w-[340px] shrink-0 flex-col bg-surface xl:flex" aria-label="Ask Retina">
      <header className="flex h-16 shrink-0 items-center gap-2.5 border-b border-hairline px-[18px]">
        <Icon name="chat" size={15} className="text-ink" />
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Ask Retina</h2>
        <span className="grow" />
        <a
          href={`/runs/${runId}/chat`}
          className="flex h-[26px] items-center rounded-sm border border-hairline bg-canvas px-2.5 text-caption text-ink-secondary hover:border-hairline-strong"
        >
          Whole inbox
        </a>
      </header>

      <div className="flex h-[42px] shrink-0 items-center gap-1.5 overflow-hidden border-b border-hairline px-[18px]">
        <span className="shrink-0 text-micro text-ink-tertiary">Reading</span>
        {scope.map((item) => (
          <span
            key={item.label}
            className={`inline-flex h-[21px] shrink-0 items-center rounded-sm border border-hairline bg-canvas px-2 font-mono text-mono-xs ${
              item.memory ? "text-review" : "text-ink-secondary"
            }`}
          >
            {item.label}
          </span>
        ))}
      </div>

      <div className="min-h-0 grow space-y-3 overflow-y-auto px-[18px] pt-3.5">
        <p className="max-w-[268px] rounded-lg rounded-tl-xs border border-hairline bg-canvas px-2.5 py-2.5 text-small leading-[19px] text-ink-secondary">
          {opening}
        </p>
        {chat.turns.map((turn, index) => (
          <Turn
            key={turn.id}
            turn={turn}
            exhausted={chat.exhausted && index === chat.turns.length - 1}
            onAsk={chat.ask}
            answered={index < chat.turns.length - 1 || chat.pending}
          />
        ))}
        {chat.pending ? <LiveSteps steps={chat.steps} since={chat.since} /> : null}
        {chat.error ? <p className="rounded-md bg-fault-tint px-2.5 py-2 text-small text-fault">{chat.error}</p> : null}
      </div>

      <Composer
        onAsk={chat.ask}
        onStop={chat.stop}
        pending={chat.pending}
        suggestions={chat.turns.length === 0 ? suggestions : []}
        placeholder="Tell Retina what is wrong"
      />

      <p className="px-[18px] pb-3 text-micro leading-4 text-ink-tertiary">
        Retina answers from this email, both documents, every model call it made, and what it has been taught so far.
      </p>
    </aside>
  );
}
