import type { StoredProfile } from "@/lib/api/semantic-schemas";

import { sectionsOf } from "./profile-sections";

/** What a thing is, in three labelled parts, with the unverified part saying so. */
export function ProfileSummary({ profile }: { profile: StoredProfile | null }) {
  const sections = sectionsOf(profile?.markdown ?? null);
  if (!profile || !sections.summary) {
    return (
      <p className="text-body text-ink-tertiary">
        Not profiled yet. The profile job writes one within ten minutes of the mail touching it.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-body leading-[22px] text-ink">{sections.summary}</p>
      {sections.observed ? (
        <section>
          <h3 className="text-caption font-medium text-ink-tertiary">What our mail shows</h3>
          <p className="mt-1 whitespace-pre-line text-small leading-[19px] text-ink-secondary">{sections.observed}</p>
        </section>
      ) : null}
      {sections.general ? (
        <section>
          <h3 className="text-caption font-medium text-ink-tertiary">
            General knowledge, unverified{sections.generalConfidence ? ` (confidence ${sections.generalConfidence})` : ""}
          </h3>
          <p className="mt-1 whitespace-pre-line text-small leading-[19px] text-ink-secondary">{sections.general}</p>
        </section>
      ) : null}
      {profile.stale ? (
        <p className="text-caption text-ink-faint">
          This profile is older than the mail that last touched the thing; it is queued for a rewrite.
        </p>
      ) : null}
    </div>
  );
}
