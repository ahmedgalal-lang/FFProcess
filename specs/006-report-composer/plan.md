# Implementation Plan: Report Composer

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-report-composer/spec.md`

## Summary

The Export Report page gains two more panels — pack sections, and per-process sections with
their blocks — each row a tick and a pair of arrows, alongside the process picker that
already works. The arrangement is stored as one JSON column on the workspace, merged with a
catalogue of what exists, and consumed by the report and the deck.

The visible change is small. The work is not: `export-preview.tsx` is 1,092 lines rendering
a fixed sequence with `hasX &&` guards around each part, and those guards are exactly what
the "ticked but empty still prints" decision reverses. Every one of them is being replaced
by a component with an emptiness predicate the renderer can act on.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 22

**Primary Dependencies**: Next.js 16 (App Router), React 19, Prisma 7 with
`@prisma/adapter-pg`, Zod, Tailwind v4, pptxgenjs

**Storage**: PostgreSQL. **One migration** — a nullable `reportArrangement Json?` column on
`workspaces`. No backfill: null means "never arranged", which is today's behaviour.

**Testing**: Vitest for the merge and numbering rules (`pnpm test`), Playwright end-to-end,
`@axe-core/playwright` for the accessibility bar

**Target Platform**: Server-rendered web application

**Project Type**: Web application, single Next.js project

**Performance Goals**: The arrangement is one column read once per render. Resolving it is
pure and runs over ~17 entries. Nothing here should be measurable.

**Constraints**: An un-arranged workspace must render the same document it does today
(SC-007). Controls must be keyboard-operable and meet WCAG 2.1 AA (Principle IV).

**Scale/Scope**: One migration, one domain module, one server action, two new panels on an
existing page, and a restructuring of the report renderer and the deck builder.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1.*

| Principle | How this feature satisfies it |
| --- | --- |
| **I. Type-Safe Full-Stack** | The save action takes Zod-validated input and rejects ids the catalogue does not know. `ResolvedArrangement` is one inferred type every renderer shares rather than three parallel shapes. |
| **II. Shared Domain Model** | Nothing new is modelled. The catalogue names parts of the report that already exist; the arrangement records choices about them. |
| **III. Test-First for Business Rules** | The rules worth testing are the merge (unknown ids dropped, unmentioned entries appended included, pinned blocks rejoined), the numbering (gaps close), and emptiness (a section is empty when its included blocks are). Each gets a failing test before the code. |
| **IV. Accessible, Data-Dense UI** | Arrows are buttons with `aria-label`s, not drag handles, so the panels are keyboard-operable by construction. An axe check covers the extended picker. |
| **V. Workspace Isolation & Least Privilege** | The arrangement is a column on the workspace, so it cannot leak between clients by construction. Saving checks `EDITOR` server-side; controls render only for editors, and the export controls beside them stay visible to a viewer. |
| **VI. Simplicity & Incremental Delivery** | One JSON column instead of a table nothing would query. No named arrangements, no firm-wide default, no per-process arrangement — all recorded as out of scope rather than built speculatively. |

**Post-Phase-1 re-check**: passing. Phase 1 removed one requirement rather than adding any
— FR-022 asserted a whole-report spreadsheet export that does not exist, and now protects
the two per-process downloads that do.

### Noted, not fixed here

**The deck does not print empty markers.** A slide saying "no data yet" is noise in a
summary document, so the deck skips empty sections while the report prints them marked.
This is a deliberate difference between the two formats, recorded here rather than left for
someone to find.

## Project Structure

### Documentation (this feature)

```text
specs/006-report-composer/
├── plan.md              # This file
├── spec.md              # The specification
├── research.md          # Phase 0 — seven decisions
├── data-model.md        # Phase 1 — one column, the catalogue, the merge
├── quickstart.md        # Phase 1 — how to prove it works
├── contracts/
│   └── server-actions.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — created by /speckit-tasks
```

### Source code

```text
prisma/
├── schema.prisma                          # + Workspace.reportArrangement Json?
└── migrations/<ts>_report_arrangement/    # NEW — one column, no backfill

lib/
├── domain/report-arrangement.ts           # NEW — catalogue, resolve, numbering, emptiness
├── actions/report-arrangement.ts          # NEW — saveReportArrangement
└── export/pptx/report-pptx.ts             # walks the arrangement instead of a fixed order

app/(app)/workspaces/[workspaceId]/export/
├── page.tsx                               # loads the arrangement, passes it down
└── export-picker-form.tsx                 # + the two arranging panels

app/reports/[workspaceId]/
├── page.tsx                               # loads the arrangement
└── export-preview.tsx                     # blocks become components; renderer walks order

tests/
├── unit/report-arrangement.test.ts        # NEW — merge, numbering, emptiness
└── e2e/
    ├── report-composer.spec.ts            # NEW — arrange, export, per-client, empty
    ├── report-order.spec.ts               # regression: process order still works
    ├── export.spec.ts                     # regression: the default pack is unchanged
    └── viewer-read-only.spec.ts           # extended: no arranging controls for a viewer
```

**Structure Decision**: single Next.js App Router project, as every feature before this.
The catalogue, the merge, the numbering and the emptiness predicates all live in
`lib/domain/` with no database and no React, because they are the business rules Principle
III requires tests for and because three renderers consume them.

## Phase notes

**Order of work**: the domain module first, because everything consumes it; then the
renderer, because the arranging controls are pointless without something that honours them;
then the controls; then the deck.

**The riskiest task is restructuring `export-preview.tsx`.** SC-007 — an un-arranged
workspace produces the document it produces today — gets its own test written *before* the
restructuring, so the safety net exists before the wire is walked.

## Complexity Tracking

No constitution violations. No entries.
