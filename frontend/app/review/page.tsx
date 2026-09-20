import type { Metadata } from "next";

import { Placeholder } from "@/components/shell/placeholder";

export const metadata: Metadata = { title: "Needs a person · Retina SDOC" };

export default function ReviewPage() {
  return (
    <Placeholder
      active="review"
      icon="doc"
      title="Needs a person"
      crumbs={["Needs a person"]}
      phase="phase 8"
      blurb="The emails Retina stopped on, grouped by why, with the failures in their own group."
      holds={[
        "The open cases by review_reason: wrong_doc_type, missing_attachment, unreadable, missing_value.",
        "The case pane itself, which is the email page in its NEEDS_REVIEW state and is already built.",
        "The action bar behind it: confirm, correct a field, reclassify, note, upload and retry.",
      ]}
    >
      <p className="mt-4 max-w-[560px] text-small leading-[18px] text-ink-tertiary">
        The run page already says how many need a person and what parked each one.
      </p>
    </Placeholder>
  );
}
