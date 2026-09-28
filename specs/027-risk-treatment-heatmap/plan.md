# Implementation Plan: Risk Treatment Plans & Heat Map

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

## Summary

Adds a likelihood × impact heat map above the Risk Register that filters
the table on click, and a treatment plan per risk: a strategy with
rationale, a target level, and treatment actions with owners and due dates,
flagged when overdue.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16, React 19
**Primary Dependencies**: Prisma 7 — one enum, four columns, one table
**Storage**: One additive migration
**Testing**: Vitest (unit: cells, overdue; integration: four actions),
Playwright (quickstart + the Governance page axe check)
**Project Type**: Existing single Next.js web app
**Constraints**: Heat map operable by keyboard and readable without colour;
the Governance page's axe test must pass with risks present
**Scale/Scope**: `schema.prisma`, `lib/actions/governance.ts`, new
`lib/domain/risk-treatment.ts`, `page.tsx`, `governance-risk-register.tsx`,
`governance-assessment-panel.tsx` (passes roles/people through)

## Constitution Check

- **I**: Zod-validated inputs; Prisma enums, not string unions. PASS.
- **II**: Owners reuse the shared Role/Person directory; levels reuse `deriveRiskLevel`. PASS.
- **III**: Cell counting, overdue rule and action rules tested first. PASS.
- **IV**: Heat map is a table of labelled buttons; existing unlabelled selects fixed. PASS.
- **V**: Every action ownership-checks risk/action/role/person; EDITOR-gated. PASS.
- **VI**: No appetite thresholds, no residual heat map, no notifications. PASS.

## Project Structure

```text
prisma/schema.prisma                         # CHANGED
prisma/migrations/<ts>_risk_treatment/       # NEW (generated)
lib/domain/risk-treatment.ts                 # NEW
lib/actions/governance.ts                    # CHANGED — 4 new actions
app/(app)/workspaces/[workspaceId]/governance/page.tsx                      # CHANGED
app/(app)/workspaces/[workspaceId]/governance/governance-risk-register.tsx  # CHANGED
app/(app)/workspaces/[workspaceId]/governance/governance-assessment-panel.tsx  # CHANGED (props)
tests/unit/risk-treatment.test.ts            # NEW
tests/integration/governance.test.ts         # CHANGED
tests/e2e/risk-treatment-heatmap.spec.ts     # NEW
```

## Complexity Tracking

*No violations.*
