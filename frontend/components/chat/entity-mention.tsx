"use client";

import Link from "next/link";
import { HoverCard } from "radix-ui";
import { motion } from "motion/react";
import type { ReactNode } from "react";

import { HUE_CLASSES, kindOf } from "@/components/business/kind";
import { panel } from "@/lib/motion";

import { MentionCard } from "./mention-card";
import type { Mention } from "./mention";

/**
 * A name in an answer that the agent resolved, drawn as the thing it is.
 *
 * Hovering opens what it is; clicking opens its page. The marking is the kind's
 * own hue and a dotted rule, which says "there is more here" without turning a
 * sentence into a row of buttons: docs/05-design.md section 4.10 keeps hue for
 * what a thing is and never for how it was judged.
 *
 * A kind with no page of its own is still worth hovering, so it keeps the card
 * and loses only the navigation.
 */

/** Long enough that a reader sweeping the sentence does not fire three cards. */
const OPEN_MS = 320;

export function EntityMention({ mention, children }: { mention: Mention; children: ReactNode }) {
  const hue = HUE_CLASSES[kindOf(mention.kind).hue];
  const marks = `cursor-pointer underline decoration-dotted decoration-from-font underline-offset-[3px] transition-colors duration-150 ${hue.text} hover:decoration-solid`;

  return (
    <HoverCard.Root openDelay={OPEN_MS} closeDelay={120}>
      <HoverCard.Trigger asChild>
        {mention.href ? (
          <Link href={mention.href} className={marks}>
            {children}
          </Link>
        ) : (
          <span className={`${marks} cursor-default`} tabIndex={0}>
            {children}
          </span>
        )}
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content side="top" align="start" sideOffset={6} collisionPadding={12} asChild>
          <motion.div
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={panel}
            className="z-50 w-[280px] rounded-lg border border-hairline bg-canvas p-3 shadow-overlay"
          >
            <MentionCard id={mention.id} />
          </motion.div>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
