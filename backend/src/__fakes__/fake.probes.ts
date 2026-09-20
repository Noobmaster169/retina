import type { Probes } from "../health-probes";

/** What each HTTP dependency answers, without one running. A probe set to an Error throws it, which reads as down. */
export class FakeProbes implements Probes {
  inboxAnswer: { emails?: number; scoringAvailable?: boolean } | Error = { emails: 520, scoringAvailable: true };
  docExtractAnswer: { tesseract?: string | null } | Error = { tesseract: "5.5.0" };
  llmProxyAnswer: { models?: number } | Error = { models: 4 };

  async inbox() {
    return answer(this.inboxAnswer);
  }

  async docExtract() {
    return answer(this.docExtractAnswer);
  }

  async llmProxy() {
    return answer(this.llmProxyAnswer);
  }
}

function answer<T>(value: T | Error): T {
  if (value instanceof Error) throw value;
  return value;
}
