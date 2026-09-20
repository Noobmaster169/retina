"use client";

import { Tabs as RadixTabs } from "radix-ui";
import { motion } from "motion/react";

import { panel } from "@/lib/motion";

/**
 * Radix carries the roving tabindex and the aria wiring; everything visible
 * here is ours. The underline is one element moved between triggers with a
 * shared layout id, so it slides rather than cutting.
 */

export interface TabDef {
  value: string;
  label: string;
  /** A count beside the label, in faint ink because the label already says what it counts. */
  count?: number | string;
}

interface TabListProps {
  tabs: TabDef[];
  /** Shared across one tab strip; two strips on a page must not share it or the underline flies between them. */
  layoutId: string;
  value: string;
  className?: string;
}

export function TabList({ tabs, layoutId, value, className = "" }: TabListProps) {
  return (
    <RadixTabs.List className={`flex h-[42px] shrink-0 items-stretch gap-5 ${className}`}>
      {tabs.map((tab) => (
        <RadixTabs.Trigger
          key={tab.value}
          value={tab.value}
          className="group relative flex items-center gap-1.5 text-strong text-ink-tertiary transition-colors duration-150 data-[state=active]:font-medium data-[state=active]:text-ink"
        >
          <span>{tab.label}</span>
          {tab.count === undefined ? null : <span className="text-micro text-ink-faint">{tab.count}</span>}
          {tab.value === value ? (
            <motion.span
              layoutId={layoutId}
              transition={panel}
              className="absolute inset-x-0 bottom-0 h-0.5 bg-ink"
              aria-hidden="true"
            />
          ) : null}
        </RadixTabs.Trigger>
      ))}
    </RadixTabs.List>
  );
}

export const Tabs = RadixTabs.Root;
export const TabPanel = RadixTabs.Content;
