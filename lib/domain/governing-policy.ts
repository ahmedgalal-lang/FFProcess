/**
 * Whether an aspect is governed (spec 029) — pure, shared by the aspect
 * tabs, the summary panel and the exported report. Only a Published policy
 * counts; a Retired one is waiting for its replacement.
 */

export type AspectPolicyState = "NONE" | "NOT_PUBLISHED" | "PUBLISHED";

export function aspectPolicyState(policy: { lifecycleStatus: string } | null): AspectPolicyState {
  if (!policy) return "NONE";
  return policy.lifecycleStatus === "PUBLISHED" ? "PUBLISHED" : "NOT_PUBLISHED";
}
