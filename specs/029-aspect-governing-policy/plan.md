# Implementation Plan: A Governing Policy for Every Aspect

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

## Summary

Each governance aspect gets at most one governing policy: an ordinary
Policy Library policy linked to it. It can be started from a built-in
template, drafted by the AI (on request, or by the assessment when the
aspect has none), written by hand, or chosen from the library. The aspect
tab, the tab list, the Policy Library, the summary panel and the exported
report all show it, and the spec 018 lifecycle applies unchanged.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16, React 19
**Primary Dependencies**: Prisma 7 (one nullable unique column); the existing Gemini structured-output helper
**Storage**: One additive migration
**Testing**: Vitest (unit: template ranking and filling, policy state; integration: the three actions, generate, cascade rules), Playwright (quickstart + axe)
**Project Type**: Existing single Next.js web app
**Scale/Scope**: 14 templates; new `lib/actions/governing-policy.ts`, `lib/domain/policy-templates.ts`, `lib/domain/governing-policy.ts`, `governing-policy-panel.tsx`; changes to `governance.ts` (generate + shared logger), the generator, the assessment panel, policy library, page, dashboard, report builder, preview and PPTX

## Constitution Check

- **I**: Zod at every action boundary; uniqueness enforced by the database, not only the UI. PASS.
- **II**: Reuses the Policy Library and lifecycle instead of a second policy store. PASS.
- **III**: Template ranking, state, designation rules and generate behaviour tested first. PASS.
- **IV**: Labelled controls; state in text, not colour; axe-checked with the panel open. PASS.
- **V**: Every id ownership-checked; EDITOR for designation and creation; approval stays ADMIN. PASS.
- **VI**: Templates in code, no template editor; one link column. PASS.

## Project Structure

```text
prisma/schema.prisma                                  # CHANGED
prisma/migrations/<ts>_aspect_governing_policy/       # NEW
lib/domain/policy-templates.ts                        # NEW
lib/domain/governing-policy.ts                        # NEW
lib/actions/governing-policy.ts                       # NEW
lib/data/governance-activity.ts                       # CHANGED (shared logger)
lib/actions/governance.ts                             # CHANGED (generate, logger import)
lib/ai/governance-generator.ts                        # CHANGED
lib/domain/governance-dashboard.ts                    # CHANGED
lib/domain/governance-report.ts, lib/reports/load-report-data.ts   # CHANGED
app/(app)/workspaces/[workspaceId]/governance/*       # panel, library, page
app/reports/[workspaceId]/export-preview.tsx, lib/export/pptx/report-pptx.ts   # CHANGED
tests/…                                               # unit, integration, e2e
```

## Complexity Tracking

*No violations.*
