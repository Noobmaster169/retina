"use client";

import { motion } from "motion/react";
import type { ComponentProps, ReactNode } from "react";

import { quick } from "@/lib/motion";

/**
 * Interactive is ink, not a colour: docs/05-design.md section 4.3. That is the
 * decision that frees all five hues to mean something, so nothing here takes a
 * verdict tint except `memory`, which is the one write path that is itself a
 * lesson.
 */

type Variant = "primary" | "secondary" | "quiet" | "memory";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-ink-inverse font-medium",
  secondary: "border border-hairline-strong text-ink",
  quiet: "text-ink-secondary hover:bg-sunken",
  memory: "bg-review text-ink-inverse font-medium",
};

interface ButtonProps extends Omit<ComponentProps<typeof motion.button>, "children"> {
  children: ReactNode;
  variant?: Variant;
  /** The keyboard shortcut, set in mono beside the label at half weight. */
  shortcut?: string;
}

export function Button({ children, variant = "secondary", shortcut, className = "", ...rest }: ButtonProps) {
  const hint = variant === "primary" || variant === "memory" ? "opacity-50" : "text-ink-faint";
  return (
    <motion.button
      type="button"
      whileHover={rest.disabled ? undefined : { opacity: 0.86 }}
      whileTap={rest.disabled ? undefined : { scale: 0.985 }}
      transition={quick}
      className={`inline-flex h-[34px] shrink-0 items-center gap-2 rounded-md px-3 text-strong disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
      {shortcut ? <span className={`font-mono text-micro ${hint}`}>{shortcut}</span> : null}
    </motion.button>
  );
}
