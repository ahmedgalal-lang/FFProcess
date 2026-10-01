/**
 * The Governance page's summary panel (spec 026): one pure function turning
 * the registers' records into attention tiles, each linking to what it
 * counts.
 */

export type DashboardTone = "alert" | "warn" | "neutral";

export type DashboardTile = {
  id: string;
  label: string;
  count: number;
  /** The whole the count is part of, shown as "of 42". */
  total?: number;
  tone: DashboardTone;
  href: string;
};

type Level = "LOW" | "MEDIUM" | "HIGH";

export type DashboardInput = {
  risks: { level: Level; closed: boolean }[];
  policies: { needsReview: boolean }[];
  checklist: { done: number; total: number; overdue: number };
  treatment: { overdueActions: number };
  /** Spec 029: one entry per aspect. Optional so callers without aspects add no tile. */
  aspects?: { hasPublishedPolicy: boolean }[];
};

const tone = (count: number, whenNonZero: DashboardTone): DashboardTone => (count > 0 ? whenNonZero : "neutral");

export function isDashboardEmpty(input: DashboardInput): boolean {
  return (
    input.risks.length === 0 &&
    input.policies.length === 0 &&
    input.checklist.total === 0
  );
}

export function buildDashboardTiles(input: DashboardInput): DashboardTile[] {
  const tiles: DashboardTile[] = [];
  const openRisks = input.risks.filter((r) => !r.closed);
  const levelTone: Record<Level, DashboardTone> = { HIGH: "alert", MEDIUM: "warn", LOW: "neutral" };
  for (const level of ["HIGH", "MEDIUM", "LOW"] as const) {
    const count = openRisks.filter((r) => r.level === level).length;
    const word = level.charAt(0) + level.slice(1).toLowerCase();
    tiles.push({ id: `risks-${level.toLowerCase()}`, label: `Open ${word} risks`, count, tone: tone(count, levelTone[level]), href: `?riskLevel=${level}#risk-register` });
  }
  if (input.treatment.overdueActions > 0) {
    const count = input.treatment.overdueActions;
    tiles.push({ id: "treatment-overdue", label: "Overdue treatment actions", count, tone: "alert", href: "#risk-register" });
  }

  const reviewDue = input.policies.filter((p) => p.needsReview).length;
  tiles.push({ id: "policies-review", label: "Policies overdue for review", count: reviewDue, tone: tone(reviewDue, "warn"), href: "#policy-library" });

  if (input.aspects && input.aspects.length > 0) {
    const ungoverned = input.aspects.filter((a) => !a.hasPublishedPolicy).length;
    tiles.push({
      id: "aspects-without-policy",
      label: "Aspects without a published governing policy",
      count: ungoverned,
      total: input.aspects.length,
      tone: tone(ungoverned, "warn"),
      href: "#governance-assessment",
    });
  }

  tiles.push({
    id: "checklist-done",
    label: "Checklist items done",
    count: input.checklist.done,
    total: input.checklist.total,
    tone: "neutral",
    href: "#governance-assessment",
  });
  if (input.checklist.overdue > 0) {
    tiles.push({ id: "checklist-overdue", label: "Overdue checklist items", count: input.checklist.overdue, tone: "alert", href: "#governance-assessment" });
  }

  return tiles;
}
