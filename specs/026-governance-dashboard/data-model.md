# Data Model: Governance Dashboard

No schema change. Everything is derived at view time.

## Domain (`lib/domain/governance-dashboard.ts`, NEW, pure)

```ts
type DashboardTile = {
  id: string;            // "risks-high", "policies-review", ...
  label: string;         // "Open High risks"
  count: number;
  tone: "alert" | "warn" | "neutral";
  href: string;          // "?riskLevel=HIGH#risk-register"
};

buildDashboardTiles(input: {
  risks: { level; status }[];
  policies: { needsReview: boolean }[];
  checklist: { done: number; total: number; overdue: number };
  incidents?: { open: {severity}[]; overdueActions: number; breachesOverdue: number };
  vendors?: { dueDiligenceOverdue: number; renewalSoon: number };
  conflicts?: { open: number };
  training?: { expired: number; expiringSoon: number };
  privacy?: { dpiaRecommended: number };
  treatment?: { overdueActions: number };
  ethics?: { open: number };   // present only for Admins
}): DashboardTile[]

isDashboardEmpty(input): boolean
```

## UI

- New `governance-dashboard.tsx`, rendered first on the Governance page.
- Section anchors added to each register's section element.
- `GovernanceRiskRegister` honours a `riskLevel` search param (all aspects,
  labelled, clearable).
