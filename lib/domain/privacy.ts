/**
 * The privacy register's derived flags (spec 025) — pure, not stored.
 */

/**
 * GDPR Art. 35: processing special-category data calls for a DPIA. Once any
 * DPIA on the activity is approved, the recommendation is met.
 */
export function isDpiaRecommended(activity: { specialCategory: boolean; dpias: readonly { status: "DRAFT" | "APPROVED" }[] }): boolean {
  return activity.specialCategory && !activity.dpias.some((d) => d.status === "APPROVED");
}

/** GDPR Art. 36: a high residual risk after mitigation may need prior consultation with the regulator. */
export function needsPriorConsultation(dpia: { residualRisk: "LOW" | "MEDIUM" | "HIGH" }): boolean {
  return dpia.residualRisk === "HIGH";
}

/**
 * A comma-separated input as a list: trimmed, blanks dropped, and repeats
 * (ignoring case) kept once, first spelling wins.
 */
export function parseList(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(",")) {
    const value = part.trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out;
}
