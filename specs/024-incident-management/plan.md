# Implementation Plan: Incident & Issue Management

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

## Summary

A workspace-wide incident log on the Governance page: severity, category,
status with a root-cause requirement to resolve, corrective actions with
owners and overdue flags, a personal-data-breach 72-hour notification
clock, and links to risks on the Risk Register.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16, React 19
**Primary Dependencies**: Prisma 7 — three enums, three tables
**Storage**: One additive migration
**Testing**: Vitest (unit: deadline, states, overdue, sorting;
integration: every action), Playwright (quickstart + axe)
**Project Type**: Existing single Next.js web app
**Scale/Scope**: New `lib/actions/incidents.ts` (governance.ts is already
~1,100 lines), new `lib/domain/incidents.ts`, new
`governance-incidents.tsx`, `page.tsx`, `schema.prisma`

## Constitution Check

- **I**: Zod at every action boundary; Prisma enums. PASS.
- **II**: Owners and processes reuse the shared directory and process
  models; risks linked, not copied. PASS.
- **III**: Breach clock, overdue, root-cause rule tested first. PASS.
- **IV**: Labelled controls; states in text; axe-checked. PASS.
- **V**: Every id ownership-checked against the workspace; EDITOR writes,
  VIEWER reads. PASS.
- **VI**: Free-form status with one enforced rule instead of a state
  machine; no attachments, no notifications. PASS.

## Project Structure

```text
prisma/schema.prisma                           # CHANGED
prisma/migrations/<ts>_incidents/              # NEW (generated)
lib/domain/incidents.ts                        # NEW
lib/actions/incidents.ts                       # NEW
app/(app)/workspaces/[workspaceId]/governance/governance-incidents.tsx  # NEW
app/(app)/workspaces/[workspaceId]/governance/page.tsx                  # CHANGED
tests/unit/incidents.test.ts                   # NEW
tests/integration/incidents.test.ts            # NEW
tests/e2e/incidents.spec.ts                    # NEW
```

## Complexity Tracking

*No violations.*
