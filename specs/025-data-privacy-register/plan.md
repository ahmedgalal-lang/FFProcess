# Implementation Plan: Data Privacy Register

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

## Summary

A record of processing activities (Article 30 fields, special-category and
transfer details), DPIAs with Admin sign-off and derived flags, and a view
of personal-data breaches from the incident log (spec 024), linkable to the
activities they affected.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16, React 19
**Primary Dependencies**: Prisma 7 — three enums, three tables
**Storage**: One additive migration
**Testing**: Vitest (unit: flags; integration: actions incl. ADMIN-only
approval and re-draft on edit), Playwright (quickstart + axe)
**Project Type**: Existing single Next.js web app
**Dependency**: User Story 3 requires spec 024's `GovernanceIncident`.
**Scale/Scope**: new `lib/actions/privacy.ts`, `lib/domain/privacy.ts`,
`governance-privacy.tsx`; `page.tsx`, `schema.prisma`

## Constitution Check

- **I**: Zod at every boundary; Prisma enums. PASS.
- **II**: Reuses processes, roles, people and incidents by reference. PASS.
- **III**: Flags, approval rule and re-draft invariant tested first. PASS.
- **IV**: Labelled controls; flags in text; axe-checked. PASS.
- **V**: Ownership checks throughout; ADMIN for approval, EDITOR writes, VIEWER reads. PASS.
- **VI**: No data-subject requests, no discovery, free-text categories. PASS.

## Project Structure

```text
prisma/schema.prisma                           # CHANGED
prisma/migrations/<ts>_privacy_register/       # NEW (generated)
lib/domain/privacy.ts                          # NEW
lib/actions/privacy.ts                         # NEW
app/(app)/workspaces/[workspaceId]/governance/governance-privacy.tsx  # NEW
app/(app)/workspaces/[workspaceId]/governance/page.tsx                # CHANGED
tests/unit/privacy.test.ts                     # NEW
tests/integration/privacy.test.ts              # NEW
tests/e2e/privacy.spec.ts                      # NEW
```

## Complexity Tracking

*No violations.*
