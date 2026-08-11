/**
 * RACI matrix validation rules (spec FR-006, FR-007). Pure and framework-free so
 * it is unit-testable without the database or web framework (Constitution
 * Principle III).
 */

export type RaciCode = "RESPONSIBLE" | "ACCOUNTABLE" | "CONSULTED" | "INFORMED";

export type RaciActivity = {
  activityId: string;
  name: string;
  assignments: { roleId: string; code: RaciCode }[];
};

export type RaciIssue =
  | { activityId: string; type: "MISSING_ACCOUNTABLE"; roleIds: string[] }
  | { activityId: string; type: "MULTIPLE_ACCOUNTABLE"; roleIds: string[] }
  | { activityId: string; type: "MISSING_RESPONSIBLE"; roleIds: string[] };

export function validateRaciMatrix(activities: RaciActivity[]): RaciIssue[] {
  const issues: RaciIssue[] = [];

  for (const activity of activities) {
    const accountableRoleIds = activity.assignments
      .filter((a) => a.code === "ACCOUNTABLE")
      .map((a) => a.roleId);
    const responsibleRoleIds = activity.assignments
      .filter((a) => a.code === "RESPONSIBLE")
      .map((a) => a.roleId);

    if (accountableRoleIds.length === 0) {
      issues.push({ activityId: activity.activityId, type: "MISSING_ACCOUNTABLE", roleIds: [] });
    } else if (accountableRoleIds.length > 1) {
      issues.push({
        activityId: activity.activityId,
        type: "MULTIPLE_ACCOUNTABLE",
        roleIds: accountableRoleIds,
      });
    }

    if (responsibleRoleIds.length === 0) {
      issues.push({ activityId: activity.activityId, type: "MISSING_RESPONSIBLE", roleIds: [] });
    }
  }

  return issues;
}
