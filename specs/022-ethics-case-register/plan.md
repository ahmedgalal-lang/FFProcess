# Implementation Plan: Ethics & Whistleblower Case Register

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

## Summary

A confidential, Admin-only case register: logged by consultants, never-
reused references, triage through closure with a required outcome,
append-only investigation notes, and deletion only while New. Invisible to
Editors and Viewers, and excluded from exports, the activity log and
non-Admin dashboard counts.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16, React 19
**Primary Dependencies**: Prisma 7 — five enums, two tables, one column
**Storage**: One additive migration
**Testing**: Vitest (integration: every action is ADMIN-only; numbering;
deletion rule; closing rule; anonymity rule), Playwright (quickstart,
including the Editor view)
**Project Type**: Existing single Next.js web app
**Scale/Scope**: new `lib/actions/ethics.ts`, `lib/domain/ethics.ts`,
`governance-ethics.tsx`; `page.tsx` (loads cases only for Admins),
`schema.prisma`

## Constitution Check

- **I**: Zod at every boundary; Prisma enums. PASS.
- **II**: Investigators reuse the People directory. PASS.
- **III**: Access, numbering, deletion and closing rules tested first. PASS.
- **IV**: Labelled controls; axe-checked. PASS.
- **V**: The strictest gate in the product: ADMIN on every read and write,
  enforced server-side, never loaded for non-Admins. PASS.
- **VI**: No public intake, attachments, or notifications (confirmed with
  the user). PASS.

## Project Structure

```text
prisma/schema.prisma                         # CHANGED
prisma/migrations/<ts>_ethics_cases/         # NEW (generated)
lib/domain/ethics.ts                         # NEW
lib/actions/ethics.ts                        # NEW
app/(app)/workspaces/[workspaceId]/governance/governance-ethics.tsx  # NEW
app/(app)/workspaces/[workspaceId]/governance/page.tsx               # CHANGED
tests/unit/ethics.test.ts                    # NEW
tests/integration/ethics.test.ts             # NEW
tests/e2e/ethics-cases.spec.ts               # NEW
```

## Complexity Tracking

*No violations.*
