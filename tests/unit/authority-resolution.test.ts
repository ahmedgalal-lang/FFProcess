import { describe, expect, it } from "vitest";
import { resolveApprovers, validateApprovalRules, type ApprovalRule } from "@/lib/domain/authority-resolution";

const rules: ApprovalRule[] = [
  { id: "rule-ap", approverLabel: "AP Clerk", maxThreshold: 10000, coApprovalAboveThreshold: null, coApproverLabel: null },
  { id: "rule-fm", approverLabel: "Finance Manager", maxThreshold: 100000, coApprovalAboveThreshold: 50000, coApproverLabel: "Controller" },
];

describe("resolveApprovers", () => {
  it("returns the tightest sufficient rule for a value within the first tier", () => {
    const result = resolveApprovers(rules, 5000);
    expect(result).toEqual({ gap: false, approverLabel: "AP Clerk", coApproverLabel: null });
  });

  it("returns the co-approver when the value exceeds the co-approval threshold", () => {
    const result = resolveApprovers(rules, 60000);
    expect(result).toEqual({ gap: false, approverLabel: "Finance Manager", coApproverLabel: "Controller" });
  });

  it("does not require co-approval when value is within the tier but below the co-approval threshold", () => {
    const result = resolveApprovers(rules, 20000);
    expect(result).toEqual({ gap: false, approverLabel: "Finance Manager", coApproverLabel: null });
  });

  it("flags a gap when no rule covers the value", () => {
    const result = resolveApprovers(rules, 250000);
    expect(result).toEqual({ gap: true });
  });

  it("treats the threshold boundary as inclusive", () => {
    const result = resolveApprovers(rules, 10000);
    expect(result).toEqual({ gap: false, approverLabel: "AP Clerk", coApproverLabel: null });
  });

  it("treats the co-approval boundary as inclusive (no co-approval exactly at the threshold)", () => {
    const result = resolveApprovers(rules, 50000);
    expect(result).toEqual({ gap: false, approverLabel: "Finance Manager", coApproverLabel: null });
  });
});

describe("validateApprovalRules", () => {
  it("reports no conflicts for non-overlapping tiers", () => {
    expect(validateApprovalRules(rules)).toEqual([]);
  });

  it("flags two rules with identical, ambiguous thresholds", () => {
    const conflicting: ApprovalRule[] = [
      { id: "a", approverLabel: "Role A", maxThreshold: 10000, coApprovalAboveThreshold: null, coApproverLabel: null },
      { id: "b", approverLabel: "Role B", maxThreshold: 10000, coApprovalAboveThreshold: null, coApproverLabel: null },
    ];
    const issues = validateApprovalRules(conflicting);
    expect(issues).toEqual([{ type: "CONFLICT", ruleIds: ["a", "b"] }]);
  });
});
