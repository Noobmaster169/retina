"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { EmailVerdict } from "@/lib/api/scoring-schemas";
import type { EmailTrace } from "@/lib/api/trace-schemas";

import { promptNote } from "./prompt-note";

/** The whole case as text, on the clipboard, for the session where the prompt is rewritten. */
export function CopyNote({ verdict, trace }: { verdict: EmailVerdict; trace: EmailTrace | undefined }) {
  const [state, setState] = useState<"rest" | "copied" | "refused">("rest");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(promptNote(verdict, trace));
      setState("copied");
    } catch {
      setState("refused");
    }
    setTimeout(() => setState("rest"), 2000);
  };

  return (
    <Button onClick={() => void copy()} className="h-[30px] text-small">
      {state === "copied" ? "Copied" : state === "refused" ? "The browser refused the clipboard" : "Copy the whole case"}
    </Button>
  );
}
