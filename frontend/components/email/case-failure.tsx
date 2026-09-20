import { EvidenceWell } from "@/components/ui/marked-span";
import type { ReviewCaseView } from "@/lib/api/trace-schemas";

/**
 * A job that failed for good. It is not one of the organisers' four reasons
 * and it is not an escalation: nothing is wrong with the email, something was
 * wrong with the run. So it is red rather than violet, and the only thing to
 * do about it is to try it again.
 *
 * What is shown is what a person can act on: which stage stopped, how many
 * attempts it spent, and what it said. The stack is in the log and in the
 * case's own record; putting it on screen would be exposure, not information.
 */
export function FailureBody({ review }: { review: ReviewCaseView }) {
  const detail = review.detail as { message?: unknown; attempts?: unknown };
  const message = typeof detail.message === "string" ? detail.message : "The job gave no message.";
  const attempts = typeof detail.attempts === "number" ? detail.attempts : null;

  return (
    <>
      <section className="border-t border-hairline-faint pl-3 pt-3 shadow-[inset_2px_0_0_0_var(--verdict-fault)]">
        <h3 className="text-small font-medium text-ink-tertiary">What stopped</h3>
        <p className="mt-1.5 max-w-[68ch] text-body text-ink-secondary">
          The {review.stage} stage could not finish{attempts === null ? "" : ` after ${attempts} attempt${attempts === 1 ? "" : "s"}`}. Nothing was
          decided about this email and nothing was guessed. It is reported as incomplete rather than as needing a person, because the email is not
          the problem.
        </p>
        <div className="mt-2.5 max-w-[80ch]">
          <EvidenceWell tone="fault" quote={message} />
        </div>
      </section>

      <p className="max-w-[68ch] pl-3 pt-3.5 text-small leading-[18px] text-ink-tertiary">
        Once whatever it was waiting on is back, sending the email through again picks it up where it stopped. Everything already read is kept, so a
        retry pays for the calls it has not made yet and no others.
      </p>
    </>
  );
}
