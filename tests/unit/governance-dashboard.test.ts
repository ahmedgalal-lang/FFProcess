import { describe, expect, it } from "vitest";
import { buildDashboardTiles, isDashboardEmpty, type DashboardInput } from "@/lib/domain/governance-dashboard";

const empty: DashboardInput = {
  risks: [],
  policies: [],
  checklist: { done: 0, total: 0, overdue: 0 },
  treatment: { overdueActions: 0 },
  incidents: [],
  vendors: [],
  conflicts: [],
  training: { expired: 0, expiringSoon: 0, completions: 0 },
  privacy: [],
};

const tile = (input: DashboardInput, id: string) => buildDashboardTiles(input).find((t) => t.id === id);
const ids = (input: DashboardInput) => buildDashboardTiles(input).map((t) => t.id);

describe("isDashboardEmpty", () => {
  it("is empty only when no register holds anything", () => {
    expect(isDashboardEmpty(empty)).toBe(true);
    expect(isDashboardEmpty({ ...empty, risks: [{ level: "LOW", closed: true }] })).toBe(false);
    expect(isDashboardEmpty({ ...empty, checklist: { done: 0, total: 3, overdue: 0 } })).toBe(false);
    expect(isDashboardEmpty({ ...empty, ethics: [{ closed: false }] })).toBe(false);
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
    expect(tile(input, "checklist-done")).toMatchObject({ count: 3, detail: "of 10" });
    expect(tile(input, "checklist-overdue")).toBeUndefined();
    expect(tile({ ...input, checklist: { done: 3, total: 10, overdue: 2 } }, "checklist-overdue")).toMatchObject({ count: 2, tone: "alert" });
  });

  it("adds no tiles for a register with nothing in it", () => {
    expect(ids(empty)).toEqual(["risks-high", "risks-medium", "risks-low", "policies-review", "checklist-done"]);
  });

  it("summarises open incidents by severity, with overdue actions and breach notifications", () => {
    const input = {
      ...empty,
      incidents: [
        { severity: "CRITICAL" as const, closed: false, overdueActions: 1, breachOverdue: true },
        { severity: "HIGH" as const, closed: false, overdueActions: 2, breachOverdue: false },
        { severity: "HIGH" as const, closed: false, overdueActions: 0, breachOverdue: false },
        { severity: "LOW" as const, closed: true, overdueActions: 0, breachOverdue: false },
      ],
    };
    expect(tile(input, "incidents-open")).toMatchObject({ count: 3, detail: "1 Critical, 2 High", tone: "alert", href: "#incidents" });
    expect(tile(input, "incidents-actions-overdue")).toMatchObject({ count: 3 });
    expect(tile(input, "breaches-overdue")).toMatchObject({ count: 1 });
  });

  it("covers vendors, conflicts, training, privacy and treatment actions", () => {
    const input: DashboardInput = {
      ...empty,
      treatment: { overdueActions: 2 },
      vendors: [
        { dueDiligenceOverdue: true, renewalSoon: true, contractExpired: false },
        { dueDiligenceOverdue: false, renewalSoon: false, contractExpired: true },
      ],
      conflicts: [{ closed: false }, { closed: true }],
      training: { expired: 1, expiringSoon: 2, completions: 5 },
      privacy: [{ dpiaRecommended: true }, { dpiaRecommended: false }],
    };
    expect(tile(input, "treatment-overdue")).toMatchObject({ count: 2 });
    expect(tile(input, "vendors-due-diligence")).toMatchObject({ count: 1, href: "#vendors" });
    expect(tile(input, "vendors-renewal")).toMatchObject({ count: 1 });
    expect(tile(input, "vendors-expired")).toMatchObject({ count: 1 });
    expect(tile(input, "conflicts-open")).toMatchObject({ count: 1, href: "#conflicts" });
    expect(tile(input, "training-expired")).toMatchObject({ count: 1 });
    expect(tile(input, "training-expiring")).toMatchObject({ count: 2 });
    expect(tile(input, "privacy-dpia")).toMatchObject({ count: 1, href: "#privacy" });
  });

  it("shows an ethics tile only when the ethics field is given, which the page does only for Admins", () => {
    expect(ids(empty)).not.toContain("ethics-open");
    expect(tile({ ...empty, ethics: [{ closed: false }, { closed: true }] }, "ethics-open")).toMatchObject({ count: 1, href: "#ethics-cases" });
  });
});
