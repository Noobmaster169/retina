"use client";

import { motion } from "motion/react";

/**
 * What stands above the question box while a conversation is still empty.
 *
 * It is here and not in the composer because it belongs to the empty state
 * alone: the moment a question is asked it goes, and the box it was sitting
 * over travels to the foot of the page. Its own file so chat-page.tsx stays
 * about the thread.
 */
export function Opening({ scope }: { scope: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="mx-auto mb-5 max-w-[720px] px-6 text-center"
    >
      <h1 className="font-display text-display-lg font-normal tracking-[-0.015em]">Ask Retina</h1>
      <p className="mt-1.5 text-body text-ink-tertiary">
        Reading {scope}. Every answer carries the queries that produced it, so you can check the number rather than
        take it.
      </p>
    </motion.div>
  );
}
