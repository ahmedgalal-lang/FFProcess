# Implementation Plan: Governance Dashboard

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

## Summary

A summary panel at the top of each workspace's Governance page, derived at
view time from every register, with each count linking to its records.
Ethics counts appear only for Admins. Per-workspace only.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16, React 19
**Primary Dependencies**: None new
**Storage**: No schema change
**Testing**: Vitest (unit: tile building, emptiness, Admin-only ethics),
Playwright (quickstart + axe)
**Project Type**: Existing single Next.js web app
**Dependency**: Built last, after 028, 027, 024, 025, 021, 023, 022.
**Scale/Scope**: new `lib/domain/governance-dashboard.ts`,
`governance-dashboard.tsx`; `page.tsx`; section anchors on each register;
`riskLevel` filter in `governance-risk-register.tsx`

## Constitution Check

- **I**: Typed pure function; no new boundary. PASS.
- **II**: Reads existing registers; stores nothing. PASS.
- **III**: Tile rules tested first, including Admin-only ethics. PASS.
- **IV**: Tiles are links with text counts; axe-checked. PASS.
- **V**: Ethics never computed for non-Admins. PASS.
- **VI**: No charts, trends, snapshots or cross-client view. PASS.

## Project Structure

```text
lib/domain/governance-dashboard.ts           # NEW
app/(app)/workspaces/[workspaceId]/governance/governance-dashboard.tsx  # NEW
app/(app)/workspaces/[workspaceId]/governance/page.tsx                  # CHANGED
app/(app)/workspaces/[workspaceId]/governance/governance-risk-register.tsx  # CHANGED (riskLevel)
tests/unit/governance-dashboard.test.ts      # NEW
tests/e2e/governance-dashboard.spec.ts       # NEW
```

## Complexity Tracking

*No violations.*
