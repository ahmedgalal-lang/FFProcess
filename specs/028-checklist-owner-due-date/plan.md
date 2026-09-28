# Implementation Plan: Checklist Item Owners & Due Dates

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

## Summary

Adds an optional owner (role or person) and due date to each governance
checklist item, edited through the item's existing inline Edit form, with a
derived Overdue flag per item and an overdue count per aspect tab.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16, React 19
**Primary Dependencies**: Prisma 7 — three nullable columns, two relations
**Storage**: One additive migration
**Testing**: Vitest (unit: overdue rule; integration: action semantics,
ownership, regenerate safety), Playwright (the quickstart)
**Project Type**: Existing single Next.js web app
**Constraints**: Existing tab accessible names must not change when nothing
is overdue (research Decision 6)
**Scale/Scope**: `schema.prisma`, `lib/actions/governance.ts`
(`updateGovernanceChecklistItem`), new `lib/domain/checklist-due.ts`,
`page.tsx`, `governance-assessment-panel.tsx`

## Constitution Check

- **I**: Zod-validated new fields, `YYYY-MM-DD` dates. PASS.
- **II**: Owners reuse the shared Role/Person directory. PASS.
- **III**: Overdue rule and owner validation tested first. PASS.
- **IV**: Labelled select and date input; Overdue is text, not colour only. PASS.
- **V**: Owner role/person ownership-checked against the workspace; EDITOR-gated. PASS.
- **VI**: Extends the existing edit path; no new action, no notifications. PASS.

## Project Structure

```text
prisma/schema.prisma                         # CHANGED
prisma/migrations/<ts>_checklist_owner_due_date/  # NEW (generated)
lib/domain/checklist-due.ts                  # NEW
lib/actions/governance.ts                    # CHANGED — updateGovernanceChecklistItem
app/(app)/workspaces/[workspaceId]/governance/page.tsx                      # CHANGED
app/(app)/workspaces/[workspaceId]/governance/governance-assessment-panel.tsx  # CHANGED
tests/unit/checklist-due.test.ts             # NEW
tests/integration/governance.test.ts         # CHANGED
tests/e2e/checklist-owner-due-date.spec.ts   # NEW
```

## Complexity Tracking

*No violations.*
