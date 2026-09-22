# Implementation Plan: Printed Process Map, Rebuilt

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-printed-map-rebuild/spec.md`

## Summary

Replace the report's process map with two server-rendered HTML layouts — **Flow** (down the
page, one step per row) and **Roles** (a column per role) — chosen per client and remembered
on the workspace. The rebuild's one load-bearing decision is dropping ReactFlow from the
printed path: every measured defect in the spec is a canvas abstraction meeting a fixed sheet
of paper, and plain HTML returns wrapping text, content-sized boxes and real page breaks for
free. The interactive canvas and the PPTX deck keep ReactFlow, `wrapProcessMap` and
`routeConnectors` untouched.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router

**Primary Dependencies**: no new ones. The feature *removes* a dependency from one path —
`@xyflow/react` is no longer used by the report. It stays in the project for the canvas.

**Storage**: PostgreSQL via Prisma 7. One additive column, `Workspace.reportMapLayout`, with
a default; no backfill.

**Testing**: Vitest for the pure layout module (test-first, mutation-checked, per
Constitution III); Playwright for the rendered measurements, since every success criterion is
a property of the printed output.

**Target Platform**: the report route, printed to A4 landscape through the browser's own
paged media — 269 × 182 mm of content after the report's 14 mm margins.

**Project Type**: web application (Next.js, single project).

**Performance Goals**: the map renders inside the report's existing server render with no
client JavaScript, so there is no layout pass the PDF export must wait on. This is a
correctness goal as much as a speed one.

**Constraints**: type at or above 8 pt on paper; no truncation at any label length; page
breaks only between whole steps; stored step positions never written.

**Scale/Scope**: processes seen in the product run to ~25 steps and ~6 roles. The Roles
layout is defined only to 5 roles and falls back above that.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1.*

| Principle | How this plan satisfies it |
|---|---|
| **I. Type-Safe Full-Stack** | The layout module is pure TypeScript with explicit input/output types ([contract](./contracts/print-map-layout.md)). The one new action validates with Zod at the boundary. No `any`. |
| **II. Shared Domain Model** | No new entities. The rebuild reads the `ProcessStep` and `StepConnection` that already exist; it adds no parallel notion of a step or a link. The one stored value is a rendering preference on `Workspace`, beside `reportArrangement`. |
| **III. Test-First for Business Rules** | What the module *decides* — which connection continues the spine, which label belongs to which branch, whether a process is over the role ceiling — is business logic and gets tests before implementation, mutation-checked. Pure rendering does not. |
| **IV. Accessible, Data-Dense UI** | The printed map becomes real semantic HTML rather than a canvas of absolutely-positioned divs: an ordered list of steps a screen reader can follow, with contrast checked by the existing `accessibility.spec.ts` sweep. This is a straight improvement over today. |
| **V. Workspace Isolation** | The new action is `EDITOR`-gated through `requireWorkspaceAccess` and writes one workspace's column. The report already scopes its reads. |
| **VI. Simplicity & Incremental Delivery** | Flow alone is a shippable improvement; Roles is a second slice; the chooser is a third. No abstraction is introduced for a hypothetical third layout — the module returns a tagged union of the two that exist. A whole mechanism (serpentine wrapping, row labels, marker pairs, link stubs, seam drops) is *deleted* from the printed path rather than extended. |

**No violations.** Nothing in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/013-printed-map-rebuild/
├── plan.md              # this file
├── spec.md              # what a reader must be able to do
├── research.md          # Phase 0 — the seven decisions and what was rejected
├── data-model.md        # Phase 1 — the one stored column, and the derived shapes
├── contracts/
│   ├── print-map-layout.md    # the pure module's guarantees
│   └── map-layout-action.md   # choosing and reading the layout
├── quickstart.md        # how to prove it works
└── checklists/requirements.md
```

### Source Code

```text
lib/domain/
└── print-map-layout.ts            # NEW — pure: steps+connections → FlowOutline | RolesGrid

lib/actions/
└── report-map-layout.ts           # NEW — setReportMapLayout, EDITOR-gated

app/reports/[workspaceId]/
├── export-preview.tsx             # CHANGED — renders the new map, adds the toolbar control
└── printed-map/                   # NEW — the report's own map, replacing the canvas one
    ├── printed-process-map.tsx    #   picks the layout, handles the fallback notice
    ├── flow-layout.tsx            #   the spine, the elbows, the cards
    ├── roles-layout.tsx           #   the column grid and its connectors
    └── printed-map.css            #   rails and connectors as CSS, print rules

prisma/
└── schema.prisma                  # CHANGED — ReportMapLayout enum + Workspace column

tests/
├── unit/print-map-layout.test.ts  # NEW — the module's decisions, test-first
├── e2e/printed-map.spec.ts        # NEW — the measured success criteria, per layout
└── fixtures/tender-process.ts     # EXISTS — the reported shape; load-bearing

# Untouched, deliberately:
#   app/(app)/.../map/process-map-canvas.tsx      the interactive canvas
#   lib/domain/connector-routing.ts               still used by the canvas
#   lib/domain/process-layout.ts (wrapProcessMap) still used by the PPTX deck
#   lib/export/pptx/report-pptx.ts                the deck keeps its serpentine map
```

**Structure Decision**: the new map lives under `app/reports/[workspaceId]/printed-map/`
rather than beside the canvas components it replaces. That is the scope boundary made
physical — the report's map and the workspace's map stop sharing a renderer, which is what
let a print-density change reach the live canvas in the first place. The one thing they still
share is the domain, which is where sharing belongs (Constitution II).

`StaticProcessMapDiagram` is imported by exactly one file, so it is deleted once the report
no longer calls it — not left behind as dead code.

## Delivery slices

Each is independently shippable and independently testable, in priority order from the spec.

| Slice | Delivers | Done when |
|---|---|---|
| **1 — Flow** (US1, US2, P1) | The map reads, in order, with nothing truncated | `printed-map.spec.ts` passes for FLOW; every "today" number is 0 |
| **2 — Drawn connections** (US3, US4, P2) | Branches read as branches; back-references carry their own labels | SC-006 holds; no marker pair anywhere in the printed path |
| **3 — Roles** (P2) | The swimlane read, with the ceiling and fallback | Same measurements pass for ROLES; a 6-role process falls back and says so |
| **4 — The choice** (US5, P3) | Per-client, persisted, editor-gated | SC-010; `viewer-read-only.spec.ts` sees the map and not the control |

MVP is slice 1: it alone turns an unusable map into a deliverable one.

## Risks

| Risk | Handling |
|---|---|
| Print CSS behaves differently in the PDF than on screen | Every measurement in `printed-map.spec.ts` is taken from the rendered DOM, and the page-count check reads the actual exported PDF bytes — the same method that produced the "before" numbers |
| Deleting `StaticProcessMapDiagram` breaks something unseen | It has exactly one importer; the canvas and deck suites run as a blast-radius check (quickstart §5) |
| The 5-role ceiling is wrong in practice | It is an exported constant asserted by name in tests, so moving it is a one-line change that the tests follow |
| A process shape nobody anticipated | The module's contract enumerates its edge cases and each has a unit test: no steps, one step, no role, no outgoing connection, a cycle, duplicate connections, a link leaving the process |
