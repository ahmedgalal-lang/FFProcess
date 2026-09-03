import { describe, it, expect } from "vitest";
import { buildStepAuthoritySummary } from "@/lib/domain/step-authority-summary";
import type { TableStep, TableActivity, AuthorityAssignmentData } from "@/lib/domain/authority-table";

function assignment(overrides: Partial<AuthorityAssignmentData>): AuthorityAssignmentData {
  return {
    activityId: null,
    stepId: null,
    skipped: false,
    slaDays: null,
    threshold: null,
    direction: "GREATER_THAN",
    approverRoleId: null,
    approverPersonId: null,
    coApprovalAboveThreshold: null,
    coApproverRoleId: null,
    escalationRoleId: null,
    ...overrides,
  };
}

describe("buildStepAuthoritySummary", () => {
  it("finds a step's SLA/threshold through its related Activity, not just a bare step row", () => {
    // The pitfall this exists to avoid: a naive lookup keyed by the row's own
    // `id` would look for "s1" and miss this entirely, since the row's id is
    // the Activity's id ("a1") once a step has a related Activity.
    const steps: TableStep[] = [{ id: "s1", type: "DECISION", label: "Approve PO?" }];
    const activities: TableActivity[] = [{ id: "a1", name: "Approve PO?", relatedStepId: "s1", order: 0 }];
    const assignments: AuthorityAssignmentData[] = [
      assignment({ activityId: "a1", stepId: "s1", slaDays: 3, threshold: 10000, direction: "GREATER_OR_EQUAL" }),
    ];

    const summary = buildStepAuthoritySummary(steps, activities, assignments);

    expect(summary.get("s1")).toEqual({ slaDays: 3, threshold: 10000, direction: "GREATER_OR_EQUAL" });
  });

  it("finds a step's SLA when it has no related Activity at all", () => {
    const steps: TableStep[] = [{ id: "s1", type: "TASK", label: "Pay Vendor" }];
    const assignments: AuthorityAssignmentData[] = [assignment({ stepId: "s1", slaDays: 1 })];

    const summary = buildStepAuthoritySummary(steps, [], assignments);

    expect(summary.get("s1")?.slaDays).toBe(1);
  });

  it("returns a step with nothing set as present but empty, not missing", () => {
    const steps: TableStep[] = [{ id: "s1", type: "TASK", label: "Send PO to Vendor" }];

    const summary = buildStepAuthoritySummary(steps, [], []);

    expect(summary.get("s1")).toEqual({ slaDays: null, threshold: null, direction: "GREATER_THAN" });
  });

  it("resolves two Activities on the same step by their existing display order", () => {
    const steps: TableStep[] = [{ id: "s1", type: "TASK", label: "Match Invoice" }];
    const activities: TableActivity[] = [
      { id: "a-second", name: "Second", relatedStepId: "s1", order: 1 },
      { id: "a-first", name: "First", relatedStepId: "s1", order: 0 },
    ];
    const assignments: AuthorityAssignmentData[] = [
      assignment({ activityId: "a-first", stepId: "s1", slaDays: 2 }),
      assignment({ activityId: "a-second", stepId: "s1", slaDays: 5 }),
    ];

    const summary = buildStepAuthoritySummary(steps, activities, assignments);

    expect(summary.get("s1")?.slaDays).toBe(2);
  });
});
