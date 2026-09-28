# Implementation Plan: Governance & Risk in the Exported Report

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

## Summary

The exported report's only governance content today is the per-process
"Governance, Controls & Metrics" (Key Control Points + KPIs from the
Authority Matrix); the workspace's Risk Register, Policy Library and
assessment summaries never reach it. This adds one new, workspace-wide pack
section, "Governance & Risk", between the Value Chain and the process body,
in both the printed/PDF report and the PPTX deck, toggleable from the
existing arrangement panel. One ordering fix rides along: an arrangement
saved before a pack section existed now gets that section at its catalogue
position rather than after the Closing page.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16 App Router, React 19
**Primary Dependencies**: Prisma 7 (read-only here), pptxgenjs (existing)
**Storage**: No schema change
**Testing**: Vitest (unit: pack ordering, view-model builder), Playwright
(e2e: both formats, toggle, composer snapshot, pagination suite)
**Target Platform / Project Type**: Existing single Next.js web app
**Performance Goals**: N/A — three extra workspace-scoped queries per export
**Constraints**: The composer snapshot and pagination baselines are existing
guards; the snapshot gains exactly one intended line, pagination must stay
within its current thresholds
**Scale/Scope**: `report-arrangement.ts`, new `governance-report.ts`,
`load-report-data.ts`, `export-preview.tsx`, `report-pptx.ts`, the snapshot
fixture; no change to the Governance page, its actions, or the schema

## Constitution Check

- **I. Type-Safe Full-Stack**: The view model is a typed pure function's
  output, shared by both renderers; no parallel hand-maintained types. PASS.
- **II. Shared Domain Model**: Reuses `deriveRiskLevel` rather than a second
  scoring rule; reads existing governance rows, stores nothing new. PASS.
- **III. Test-First for Business Rules**: Pack ordering and the view-model
  rules (ordering, blank-summary exclusion, emptiness) are unit-tested first. PASS.
- **IV. Accessible, Data-Dense UI**: Real `<table>`/`<th>` markup like the
  existing KPI table; levels labelled in text, not colour alone. PASS.
- **V. Workspace Isolation & Least Privilege**: All queries scoped by the
  report's already-authorized `workspaceId`; ethics cases excluded by design;
  report access unchanged (VIEWER). PASS.
- **VI. Simplicity**: No schema change, no new arrangement concept (pack
  sections stay single toggles, no pack-level blocks). PASS.

No violations.

## Project Structure

```text
lib/domain/report-arrangement.ts        # CHANGED — catalogue entry, pack ordering rule
lib/domain/governance-report.ts         # NEW — pure view-model builder
lib/reports/load-report-data.ts         # CHANGED — governance queries + field
app/reports/[workspaceId]/export-preview.tsx   # CHANGED — GovernancePackSection
lib/export/pptx/report-pptx.ts          # CHANGED — governance slides
tests/unit/report-arrangement.test.ts   # CHANGED — pack insertion tests
tests/unit/governance-report.test.ts    # NEW
tests/e2e/governance-report.spec.ts     # NEW
tests/e2e/report-composer.spec.ts       # CHANGED — title list
tests/fixtures/report-default.snapshot.txt  # CHANGED — one intended line
```

## Complexity Tracking

*No violations.*
