/**
 * The Governance page's summary panel (spec 026): one pure function turning
 * the registers' records into attention tiles, each linking to what it
 * counts. A register's tiles appear only when it holds records, so a
 * register nobody has used adds no row of zeros. The ethics field is only
 * ever filled in for Admins, so everyone else gets no ethics tile at all.
 */

export type DashboardTone = "alert" | "warn" | "neutral";

export type DashboardTile = {
  id: string;
  label: string;
  count: number;
  /** Extra context under the number, e.g. "of 42" or "2 Critical, 1 High". */
  detail?: string;
  tone: DashboardTone;
  href: string;
};

type Level = "LOW" | "MEDIUM" | "HIGH";
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type DashboardInput = {
  risks: { level: Level; closed: boolean }[];
  policies: { needsReview: boolean }[];
  checklist: { done: number; total: number; overdue: number };
  treatment: { overdueActions: number };
  incidents: { severity: Severity; closed: boolean; overdueActions: number; breachOverdue: boolean }[];
  vendors: { dueDiligenceOverdue: boolean; renewalSoon: boolean; contractExpired: boolean }[];
  conflicts: { closed: boolean }[];
  training: { expired: number; expiringSoon: number; completions: number };
  privacy: { dpiaRecommended: boolean }[];
  /** Present only when the viewer is a Workspace Admin (spec 022). */
  ethics?: { closed: boolean }[];
};

const tone = (count: number, whenNonZero: DashboardTone): DashboardTone => (count > 0 ? whenNonZero : "neutral");
const SEVERITY_WORD: Record<Severity, string> = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

export function isDashboardEmpty(input: DashboardInput): boolean {
  return (
    input.risks.length === 0 &&
    input.policies.length === 0 &&
    input.checklist.total === 0 &&
    input.incidents.length === 0 &&
    input.vendors.length === 0 &&
    input.conflicts.length === 0 &&
    input.training.completions === 0 &&
    input.privacy.length === 0 &&
    (input.ethics?.length ?? 0) === 0
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

  tiles.push({
    id: "checklist-done",
    label: "Checklist items done",
    count: input.checklist.done,
    detail: `of ${input.checklist.total}`,
    tone: "neutral",
    href: "#governance-assessment",
  });
  if (input.checklist.overdue > 0) {
    tiles.push({ id: "checklist-overdue", label: "Overdue checklist items", count: input.checklist.overdue, tone: "alert", href: "#governance-assessment" });
  }

  if (input.incidents.length > 0) {
    const open = input.incidents.filter((i) => !i.closed);
    const bySeverity = (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const)
      .map((s) => [s, open.filter((i) => i.severity === s).length] as const)
      .filter(([, n]) => n > 0)
      .map(([s, n]) => `${n} ${SEVERITY_WORD[s]}`)
      .join(", ");
    const serious = open.some((i) => i.severity === "CRITICAL" || i.severity === "HIGH");
    tiles.push({
      id: "incidents-open",
      label: "Open incidents",
      count: open.length,
      ...(bySeverity ? { detail: bySeverity } : {}),
      tone: open.length === 0 ? "neutral" : serious ? "alert" : "warn",
      href: "#incidents",
    });
    const overdueActions = input.incidents.reduce((sum, i) => sum + i.overdueActions, 0);
    if (overdueActions > 0) {
      tiles.push({ id: "incidents-actions-overdue", label: "Overdue corrective actions", count: overdueActions, tone: "alert", href: "#incidents" });
    }
    const breaches = input.incidents.filter((i) => i.breachOverdue).length;
    if (breaches > 0) {
      tiles.push({ id: "breaches-overdue", label: "Breach notifications overdue", count: breaches, tone: "alert", href: "#incidents" });
    }
  }

  if (input.vendors.length > 0) {
    const dd = input.vendors.filter((v) => v.dueDiligenceOverdue).length;
    tiles.push({ id: "vendors-due-diligence", label: "Vendor due diligence overdue", count: dd, tone: tone(dd, "alert"), href: "#vendors" });
    const renewals = input.vendors.filter((v) => v.renewalSoon).length;
    if (renewals > 0) tiles.push({ id: "vendors-renewal", label: "Contracts renewing within 60 days", count: renewals, tone: "warn", href: "#vendors" });
    const expired = input.vendors.filter((v) => v.contractExpired).length;
    if (expired > 0) tiles.push({ id: "vendors-expired", label: "Vendor contracts expired", count: expired, tone: "alert", href: "#vendors" });
  }

  if (input.conflicts.length > 0) {
    const open = input.conflicts.filter((c) => !c.closed).length;
    tiles.push({ id: "conflicts-open", label: "Open conflicts of interest", count: open, tone: tone(open, "warn"), href: "#conflicts" });
  }

  if (input.training.completions > 0) {
    const { expired, expiringSoon } = input.training;
    tiles.push({ id: "training-expired", label: "Expired training", count: expired, tone: tone(expired, "alert"), href: "#training" });
    if (expiringSoon > 0) tiles.push({ id: "training-expiring", label: "Training expiring soon", count: expiringSoon, tone: "warn", href: "#training" });
  }

  if (input.privacy.length > 0) {
    const count = input.privacy.filter((a) => a.dpiaRecommended).length;
    tiles.push({ id: "privacy-dpia", label: "Activities needing a DPIA", count, tone: tone(count, "warn"), href: "#privacy" });
  }

  if (input.ethics && input.ethics.length > 0) {
    const open = input.ethics.filter((c) => !c.closed).length;
    tiles.push({ id: "ethics-open", label: "Open ethics cases", count: open, tone: tone(open, "warn"), href: "#ethics-cases" });
  }

  return tiles;
}
