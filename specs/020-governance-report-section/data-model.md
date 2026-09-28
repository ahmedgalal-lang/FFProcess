# Data Model: Governance & Risk in the Exported Report

No schema change. Everything is read from existing tables
(`GovernanceRisk`, `GovernancePolicyDraft`, `GovernanceAssessment`,
`GovernanceAspect`, `Role`, `Person`).

## Catalogue change (`lib/domain/report-arrangement.ts`)

```ts
export const PACK_SECTIONS = [
  { id: "cover", ... },
  { id: "org", ... },
  { id: "heli", ... },
  { id: "chain", ... },
  { id: "governance", title: "Governance & Risk", kind: "pack" }, // NEW
  { id: "index", ... },
  { id: "closing", ... },
];
```

Pack ordering for stored arrangements that predate an entry: inserted after
its nearest present catalogue predecessor (research.md Decision 2).

## Report view model (`lib/domain/governance-report.ts`, NEW, pure)

```ts
type GovernanceReport = {
  summaries: { aspectName: string; summary: string }[];
  risks: {
    title: string;
    description: string;
    likelihood: "LOW" | "MEDIUM" | "HIGH";
    impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    level: "LOW" | "MEDIUM" | "HIGH";      // deriveRiskLevel
    status: "OPEN" | "MITIGATING" | "ACCEPTED" | "CLOSED";
    owner: string | null;                   // role or person name
  }[];
  policies: {
    title: string;
    lifecycleStatus: "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "RETIRED";
    effectiveDate: Date | null;
  }[];
};

buildGovernanceReport(input): GovernanceReport
isGovernanceReportEmpty(report): boolean   // all three empty
```

Ordering: summaries by aspect creation order, skipping blank summaries;
risks not-Closed first, then by level High → Low, then title; policies by
title.

## `ReportData` (`lib/reports/load-report-data.ts`)

Gains `governance: GovernanceReport`, loaded workspace-wide (not filtered by
the processes picked for the report).

## Renderers

- `app/reports/[workspaceId]/export-preview.tsx`: new `case "governance"` in
  the pack switch → `GovernancePackSection` (three sub-parts, each with its
  own specific empty message).
- `lib/export/pptx/report-pptx.ts`: new `case "governance"` → skipped when
  `isGovernanceReportEmpty`, otherwise one slide per non-empty part.
- The arrangement panel (`export-picker-form.tsx`) is catalogue-driven and
  needs no change to list the new section.
