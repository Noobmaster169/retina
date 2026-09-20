import type { Metadata } from "next";

import { Placeholder } from "@/components/shell/placeholder";

export const metadata: Metadata = { title: "Ask Retina · Retina SDOC" };

export default function ChatPage() {
  return (
    <Placeholder
      active="chat"
      icon="chat"
      title="Ask Retina"
      crumbs={["Ask Retina"]}
      phase="phase 10"
      blurb="A conversation that can read the whole model and answer from it, rather than one email at a time."
      holds={[
        "The turns, with the scope chips naming exactly what the conversation can see.",
        "The proposed action, drawn before anything is written, with Apply and remember against Just this once.",
        "The SQL a question produced, in a block a person can read.",
      ]}
    >
      <p className="mt-4 max-w-[560px] text-small leading-[18px] text-ink-tertiary">
        The 340px column on the email page is the same conversation scoped to one email. It is drawn there
        already, with its composer off and a sentence saying why.
      </p>
    </Placeholder>
  );
}
