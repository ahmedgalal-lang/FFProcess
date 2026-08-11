/**
 * Authority Matrix threshold/co-approval resolution (spec FR-010, FR-011). Pure
 * and framework-free so it is unit-testable without the database (Constitution
 * Principle III). "Label" fields stand in for whatever the caller resolved
 * (Role name or Person name) — this module doesn't know about Roles/People.
 */

export type ApprovalRule = {
  id: string;
  approverLabel: string;
  maxThreshold: number;
  coApprovalAboveThreshold: number | null;
  coApproverLabel: string | null;
};

export type ApproverResolution =
  | { gap: true }
  | { gap: false; approverLabel: string; coApproverLabel: string | null };

/**
 * Given a set of rules for one Decision Type and a query value, returns the
 * tightest (lowest sufficient) threshold's approver, plus the co-approver if the
 * value exceeds that rule's co-approval threshold. Threshold boundaries are
 * inclusive: a value exactly equal to maxThreshold is covered by that rule, and a
 * value exactly equal to coApprovalAboveThreshold does NOT yet require co-approval.
 */
export function resolveApprovers(rules: ApprovalRule[], value: number): ApproverResolution {
  const applicable = rules.filter((r) => value <= r.maxThreshold);
  if (applicable.length === 0) return { gap: true };

  const tightest = applicable.reduce((best, r) => (r.maxThreshold < best.maxThreshold ? r : best));

  const coApprovalRequired =
    tightest.coApprovalAboveThreshold !== null && value > tightest.coApprovalAboveThreshold;

  return {
    gap: false,
    approverLabel: tightest.approverLabel,
    coApproverLabel: coApprovalRequired ? tightest.coApproverLabel : null,
  };
}

export type ApprovalRuleIssue = { type: "CONFLICT"; ruleIds: string[] };

/**
 * Flags rules whose thresholds are ambiguous — i.e. two distinct rules sharing
 * the exact same maxThreshold, so there is no well-defined "tightest" rule
 * between them (FR-011).
 */
export function validateApprovalRules(rules: ApprovalRule[]): ApprovalRuleIssue[] {
  const byThreshold = new Map<number, string[]>();
  for (const rule of rules) {
    const ids = byThreshold.get(rule.maxThreshold) ?? [];
    ids.push(rule.id);
    byThreshold.set(rule.maxThreshold, ids);
  }

  const issues: ApprovalRuleIssue[] = [];
  for (const ids of byThreshold.values()) {
    if (ids.length > 1) issues.push({ type: "CONFLICT", ruleIds: ids });
  }
  return issues;
}
