"use client";

import { Tooltip as RadixTooltip } from "radix-ui";
import { motion } from "motion/react";
import type { ReactNode } from "react";

import { panel } from "@/lib/motion";

/**
 * What a chip means, for a chip too small to say it. Radix carries the hover
 * intent, the focus behaviour and the escape handling; the surface is ours.
 *
 * It is the second thing in the product allowed the one shadow (4.7), because
 * it floats above the plane rather than being cut into it.
 */
export function Tooltip({ children, label, side = "bottom" }: { children: ReactNode; label: ReactNode; side?: "top" | "bottom" }) {
  return (
    <RadixTooltip.Provider delayDuration={200}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content side={side} sideOffset={6} collisionPadding={12} asChild>
            <motion.div
              initial={{ opacity: 0, y: side === "bottom" ? -3 : 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={panel}
              className="z-50 max-w-[320px] rounded-lg border border-hairline bg-canvas px-3 py-2.5 text-small leading-[18px] text-ink-secondary shadow-overlay"
            >
              {label}
            </motion.div>
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
