# Implementation Plan: Vendor & Third-Party Risk Register

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

## Summary

A vendor register ordered by criticality, with derived due-diligence and
contract-renewal flags and links to risks on the Risk Register, as a new
Governance page section.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16, React 19
**Primary Dependencies**: Prisma 7 — two enums, two tables
**Storage**: One additive migration
**Testing**: Vitest (unit: flags, sorting; integration: actions), Playwright
**Project Type**: Existing single Next.js web app
**Scale/Scope**: new `lib/actions/vendors.ts`, `lib/domain/vendors.ts`,
`governance-vendors.tsx`; `page.tsx`, `schema.prisma`,
`governance-risk-register.tsx` (shows linked vendors on a risk)

## Constitution Check

- **I–VI**: Same shape as specs 021/024: Zod boundaries, shared owners and
  risks by reference, derived flags tested first, labelled controls,
  ownership-checked EDITOR writes, no procurement features or reminders. PASS.

## Project Structure

```text
prisma/schema.prisma                          # CHANGED
prisma/migrations/<ts>_vendors/               # NEW (generated)
lib/domain/vendors.ts                         # NEW
lib/actions/vendors.ts                        # NEW
app/(app)/workspaces/[workspaceId]/governance/governance-vendors.tsx  # NEW
app/(app)/workspaces/[workspaceId]/governance/page.tsx                # CHANGED
tests/unit/vendors.test.ts                    # NEW
tests/integration/vendors.test.ts             # NEW
tests/e2e/vendors.spec.ts                     # NEW
```

## Complexity Tracking

*No violations.*
