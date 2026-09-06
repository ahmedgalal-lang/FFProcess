# Implementation Plan: Process Ordering

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-process-ordering/spec.md`

## Summary

Give `Process` an explicit position among its siblings, so a consultant can arrange a
workspace's processes deliberately instead of being stuck with `code` ascending. That library
order then flows to the export picker, the report and the PowerPoint deck. A single pack can
override the order for itself, carried in the report's own link, without writing back to the
library.

The technical shape is deliberately a second instance of an existing pattern: `ProcessStep` and
`Phase` already have an `order Int @default(0)`, a pure ordering module
(`lib/domain/step-order.ts`), and a permutation-checked reorder action
(`reorderProcessSteps`). This feature copies that shape rather than inventing a new one.

The one genuinely new idea is that a pack's order needs no storage at all: the export picker
already submits a plain `GET` form, so the report link already names its processes in sequence.
Making that sequence meaningful is a change to how `loadReportData` sorts, not a new entity.

## Technical Context

**Language/Version**: TypeScript 5 (`strict: true`), Node 22

**Primary Dependencies**: Next.js 16.3 (App Router, Server Components + server actions), React
19.2, Prisma 7.9, Zod 4.4

**Storage**: PostgreSQL via Prisma. One added column (`processes.order`) and one backfill
migration; no new tables.

**Testing**: Vitest 4 (unit + integration), Playwright 1.62 (e2e)

**Target Platform**: Server-rendered web app

**Project Type**: Web application — a single Next.js app, not split frontend/backend

**Performance Goals**: No new query patterns. Ordering is a sort applied to a set already
fetched per page; the existing `@@index([workspaceId, parentProcessId])` covers the read.

**Constraints**: Deploying the migration must not visibly reorder any existing workspace
(backfill from current `code` order). A report link must never fail to render because its
sequence is stale or partial.

**Scale/Scope**: Tens of processes per workspace; two levels of nesting. Four surfaces read the
order (Processes page, export picker, report, PPTX); one action writes it.

## Constitution Check

*GATE: assessed before Phase 0, re-checked after Phase 1 design.*

| Principle | Assessment | Verdict |
|-----------|-----------|---------|
| **I. Type-Safe Full-Stack** | The reorder action validates input with a Zod schema before it reaches business logic, as every action here does; inferred types are the source of truth. Strict mode already on. | PASS |
| **II. Shared Domain Model** | Reuses the existing `order`-column-plus-pure-module pattern from steps and phases rather than a second mechanism. `applyPackOrder` is generic so the report and PPTX share one rule instead of each sorting its own way. | PASS |
| **III. Test-First for Business Rules** | The ordering rules (comparator, sibling-scoped move, next-position, pack-order application) are business rules and get unit tests written before implementation, failing first. The reorder action's authorization and permutation checks get integration tests. Rendering the arrows is UI and exempt. | PASS |
| **IV. Accessible, Data-Dense UI** | Move-up/down buttons, keyboard-operable by construction — the reason drag-and-drop was rejected as the sole mechanism (research R3). Controls carry accessible names identifying which process moves; position is not conveyed by colour. | PASS |
| **V. Workspace Isolation & Least Privilege** | Every id in a reorder is checked to belong to the requesting workspace, and `EDITOR` rights are required server-side, not merely hidden in the UI. A pack's order is applied only to processes the requester can already read, so it grants no new visibility. | PASS |
| **VI. Simplicity & Incremental Delivery** | One integer column, no new entity. A pack's order rides in the link that already exists rather than becoming a stored, named, manageable object. Three independently shippable stories. | PASS |

No violations; **Complexity Tracking is therefore omitted**.

Two constitution-relevant decisions worth recording, both settled in research rather than
deferred:
- Sibling-scoped ordering makes "a sub-process never leaves its parent" a property of the data
  shape rather than an invariant to police (research R1).
- A pack never writing back to the library is true by construction, because there is nothing to
  write (research R2).

## Project Structure

### Documentation (this feature)

```text
specs/003-process-ordering/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — four decisions, with alternatives
├── data-model.md        # Phase 1 — the added column, comparator, validation, migration
├── quickstart.md        # Phase 1 — how to validate each story end to end
├── contracts/
│   └── process-ordering.md   # Domain module, server action, report-link contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output — created by /speckit-tasks, not here
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                                  # + Process.order
└── migrations/<timestamp>_process_order/          # add column + backfill from code order

lib/
├── domain/
│   └── process-order.ts                           # NEW — pure ordering rules
├── actions/
│   └── process.ts                                 # + reorderProcesses
└── reports/
    └── load-report-data.ts                        # apply the pack's order from the link

app/(app)/workspaces/[workspaceId]/
├── processes/
│   ├── page.tsx                                   # list in arranged order
│   └── process-forms.tsx                          # + move controls (client)
└── export/
    └── page.tsx                                   # list in arranged order; reorderable pack

app/reports/[workspaceId]/
└── export-preview.tsx                             # index + sections follow the given order

tests/
├── unit/
│   └── process-order.test.ts                      # NEW — comparator, move, next, pack order
├── integration/
│   └── process-reorder.test.ts                    # NEW — auth, workspace scoping, permutation
└── e2e/
    ├── core-workflows.spec.ts                     # arranging the library
    └── report-order.spec.ts                       # NEW — pack order reaches report + PPTX
```

**Structure Decision**: The existing single Next.js app layout, unchanged. Ordering rules go in
`lib/domain/` beside `step-order.ts`; the write path goes in the existing
`lib/actions/process.ts` beside `reorderProcessSteps`; the read path changes in the four places
that already list processes. No new top-level directory.

## Phase Outputs

- **Phase 0** — [research.md](./research.md): sibling-scoped ordering (R1), pack order in the
  report link (R2), reorder-by-DOM-order in a native GET form (R3), backfill from current `code`
  order so nothing appears to move on deploy (R4).
- **Phase 1** — [data-model.md](./data-model.md), [contracts/](./contracts/),
  [quickstart.md](./quickstart.md).

**Post-design constitution re-check**: PASS, unchanged. The design added no entity, no new
query pattern, and no mechanism that competes with an existing one; the one interface visible
outside the app (the report link) keeps its shape and only gains meaning in its sequence.

## Known Follow-Ups

Recorded rather than left implicit (Principle VI):

- **Drag-and-drop** may be added on top of the same move operation later. It is an addition, not
  a replacement: the keyboard path must remain.
- **Reordering from inside the preview** is not in scope — the preview renders whatever order
  its link carries, and the picker is where a pack is arranged. A small addition if wanted.
- **Sort presets** (by name, category, step count) are a different feature; `code` remains the
  deterministic fallback beneath any manual arrangement.
