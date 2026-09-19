/** What each model step is called on the page. A step with no entry shows its own name. */
const LABELS: Record<string, string> = { classify: "Generator", "classify-verify": "Verifier" };

export function stepLabel(step: string): string {
  return LABELS[step] ?? step;
}
