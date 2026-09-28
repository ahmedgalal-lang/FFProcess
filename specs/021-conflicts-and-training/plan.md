# Implementation Plan: Conflicts of Interest & Training Records

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

## Summary

A conflict-of-interest register and a training register (courses with
optional validity, completions with derived expiry states), both against
the workspace's People directory, as two new Governance page sections.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16, React 19
**Primary Dependencies**: Prisma 7 — one enum, three tables
**Storage**: One additive migration
**Testing**: Vitest (unit: expiry; integration: actions), Playwright
**Project Type**: Existing single Next.js web app
**Scale/Scope**: new `lib/actions/people-governance.ts`,
`lib/domain/training.ts`, `governance-conflicts.tsx`,
`governance-training.tsx`; `page.tsx`, `schema.prisma`

## Constitution Check

- **I**: Zod at every boundary. PASS.
- **II**: Both registers hang off the shared People directory. PASS.
- **III**: Expiry states tested first. PASS.
- **IV**: Labelled controls; states in text; axe-checked. PASS.
- **V**: Ownership checks; EDITOR writes, VIEWER reads. PASS.
- **VI**: Reuses spec 018 for attestation; fixed 30-day window; no reminders. PASS.

## Project Structure

```text
prisma/schema.prisma                                      # CHANGED
prisma/migrations/<ts>_conflicts_training/                # NEW (generated)
lib/domain/training.ts                                    # NEW
lib/actions/people-governance.ts                          # NEW
app/(app)/workspaces/[workspaceId]/governance/governance-conflicts.tsx  # NEW
app/(app)/workspaces/[workspaceId]/governance/governance-training.tsx   # NEW
app/(app)/workspaces/[workspaceId]/governance/page.tsx                  # CHANGED
tests/unit/training.test.ts                               # NEW
tests/integration/people-governance.test.ts               # NEW
tests/e2e/conflicts-and-training.spec.ts                  # NEW
```

## Complexity Tracking

*No violations.*
