import { describe, expect, it } from "vitest";
import { buildDashboardTiles, isDashboardEmpty, type DashboardInput } from "@/lib/domain/governance-dashboard";

const empty: DashboardInput = {
  risks: [],
  policies: [],
  checklist: { done: 0, total: 0, overdue: 0 },
  treatment: { overdueActions: 0 },
};

const tile = (input: DashboardInput, id: string) => buildDashboardTiles(input).find((t) => t.id === id);
const ids = (input: DashboardInput) => buildDashboardTiles(input).map((t) => t.id);

describe("isDashboardEmpty", () => {
  it("is empty only when no register holds anything", () => {
    expect(isDashboardEmpty(empty)).toBe(true);
    expect(isDashboardEmpty({ ...empty, risks: [{ level: "LOW", closed: true }] })).toBe(false);
    expect(isDashboardEmpty({ ...empty, checklist: { done: 0, total: 3, overdue: 0 } })).toBe(false);
    expect(isDashboardEmpty({ ...empty, policies: [{ needsReview: false }] })).toBe(false);
  });
});

describe("buildDashboardTiles", () => {
  it("counts open risks by level, linking to the register filtered across aspects", () => {
    const input = {
      ...empty,
      risks: [
        { level: "HIGH" as const, closed: false },
        { level: "HIGH" as const, closed: false },
        { level: "HIGH" as const, closed: true },
        { level: "MEDIUM" as const, closed: false },
      ],
    };
    expect(tile(input, "risks-high")).toEqual({ id: "risks-high", label: "Open High risks", count: 2, tone: "alert", href: "?riskLevel=HIGH#risk-register" });
    expect(tile(input, "risks-medium")).toMatchObject({ count: 1, tone: "warn" });
    expect(tile(input, "risks-low")).toMatchObject({ count: 0, tone: "neutral" });
  });

  it("always shows policy review and checklist progress, and overdue checklist items only when there are some", () => {
    const input = { ...empty, policies: [{ needsReview: true }, { needsReview: false }], checklist: { done: 3, total: 10, overdue: 0 } };
    expect(tile(input, "policies-review")).toMatchObject({ count: 1, tone: "warn", href: "#policy-library" });
    expect(tile(input, "checklist-done")).toMatchObject({ count: 3, total: 10 });
    expect(tile(input, "checklist-overdue")).toBeUndefined();
    expect(tile({ ...input, checklist: { done: 3, total: 10, overdue: 2 } }, "checklist-overdue")).toMatchObject({ count: 2, tone: "alert" });
  });

  it("shows the core tiles on a workspace with nothing overdue", () => {
    expect(ids(empty)).toEqual(["risks-high", "risks-medium", "risks-low", "policies-review", "checklist-done"]);
  });

  it("adds an overdue treatment actions tile only when there are some", () => {
    expect(tile(empty, "treatment-overdue")).toBeUndefined();
    expect(tile({ ...empty, treatment: { overdueActions: 2 } }, "treatment-overdue")).toMatchObject({ count: 2, tone: "alert", href: "#risk-register" });
  });

  it("counts aspects without a published governing policy, only when aspects are given", () => {
    expect(tile(empty, "aspects-without-policy")).toBeUndefined();
    const input = { ...empty, aspects: [{ hasPublishedPolicy: true }, { hasPublishedPolicy: false }, { hasPublishedPolicy: false }] };
    expect(tile(input, "aspects-without-policy")).toMatchObject({ count: 2, total: 3, tone: "warn", href: "#governance-assessment" });
    expect(tile({ ...empty, aspects: [{ hasPublishedPolicy: true }] }, "aspects-without-policy")).toMatchObject({ count: 0, tone: "neutral" });
  });
});
