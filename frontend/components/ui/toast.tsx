"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { panel } from "@/lib/motion";

/**
 * What was written, said once and then gone. Every action names what it wrote
 * and what it re-queued, in the api's own words: docs/design/screen-blueprints.md
 * section 14.10.
 *
 * A toast is a receipt, not a status. It never carries a spinner, it never
 * asks a question, and a failure is the same rectangle in fault ink rather
 * than a second component.
 */

export interface Toast {
  id: number;
  message: string;
  /** A second line for what a write set off, when it set anything off. */
  detail?: string;
  tone: "plain" | "fault";
}

interface ToastApi {
  /** Says what was written. Returns nothing: a receipt is not a handle. */
  say(message: string, detail?: string): void;
  /** Says what was refused, in the words the api refused it with. */
  refuse(message: string): void;
}

const LIFETIME_MS = 5000;
const Context = createContext<ToastApi | null>(null);

/** The one place a write is announced. A component that writes calls this rather than rendering its own line. */
export function useToast(): ToastApi {
  const api = useContext(Context);
  if (!api) throw new Error("useToast needs a ToastHost above it");
  return api;
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((shown) => [...shown, { ...toast, id }]);
    setTimeout(() => setToasts((shown) => shown.filter((one) => one.id !== id)), LIFETIME_MS);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      say: (message, detail) => push({ message, detail, tone: "plain" }),
      refuse: (message) => push({ message, tone: "fault" }),
    }),
    [push],
  );

  return (
    <Context.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex w-[min(520px,calc(100vw-48px))] -translate-x-1/2 flex-col gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={panel}
              className={`pointer-events-auto rounded-lg border bg-canvas px-3.5 py-2.5 ${
                toast.tone === "fault" ? "border-fault" : "border-hairline-strong"
              }`}
            >
              <p className={`text-small leading-5 ${toast.tone === "fault" ? "text-fault" : "text-ink"}`}>{toast.message}</p>
              {toast.detail ? <p className="mt-0.5 text-caption text-ink-tertiary">{toast.detail}</p> : null}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Context.Provider>
  );
}
