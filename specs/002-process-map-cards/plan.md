# Implementation Plan: Process Map Documented Cards

**Branch**: `002-process-map-cards` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-process-map-cards/spec.md`

## Summary

Redraw the Process Map diagram's step cards, decision shape, and terminal shape to the
approved "Documented Cards" mockup (bigger, readable cards showing step number, role, SLA,
and cross-process hand-off; decisions as a labelled gate card; the canvas height following
the lane count instead of a fixed 520px). The redesign lands on all three surfaces that
already draw a process map — the live interactive canvas, the static print/PDF diagram,
and the PPTX export's hand-drawn shapes — sharing the same layout math and the same new
per-step SLA/threshold lookup, built from data already fetched today.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16 App Router, React 19 — existing stack, unchanged.

**Primary Dependencies**: `@xyflow/react` (live canvas nodes/edges), Tailwind CSS (styling), `pptxgenjs` (PPTX shapes) — all already in the project; no new dependency.

**Storage**: PostgreSQL via Prisma — no schema change; reads existing `ProcessStep`, `Activity`, `AuthorityAssignment`, `ProcessStepLink` fields.

**Testing**: Vitest (`lib/domain` pure logic), Playwright + axe-core (e2e + accessibility).

**Target Platform**: Web (server-rendered + browser canvas; PDF via browser print; PPTX generated server-side).

**Project Type**: Single Next.js web application (existing structure; no new project).

**Performance Goals**: No new performance target — diagram sizes stay within the app's existing typical range (seeded processes up to ~9 steps / 3 lanes; the layout math already used is the same O(steps) cost as today).

**Constraints**: Must not regress WCAG 2.1 AA (Constitution Principle IV) — step-type distinction (task/decision/terminal) must not rely on color alone. Must not add a Prisma migration. Must keep the three rendering surfaces visually consistent (same card shapes, same information) while allowing each surface's own pixel/font technology to differ (per spec Assumptions).

**Scale/Scope**: Touches ~6 existing files (`map-nodes.tsx`, `process-map-canvas.tsx`, `process-layout.ts` constants, `map/page.tsx`, `static-process-map-diagram.tsx`, `report-pptx.ts`) plus their tests. No new routes, no new server actions, no new API surface.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Type-Safe Full-Stack | No new external boundary (no new route/action); new props/lookups typed end-to-end in strict TS, no `any`. | PASS |
| II. Shared Domain Model | SLA/threshold sourced via the existing `buildAuthorityTableRows` (already the Authority Matrix's own builder) rather than a new parallel computation; no entity duplicated. | PASS |
| III. Test-First for Business Rules | No new business rule/validation logic introduced (pure rendering + a read-only lookup) — Principle III's TDD rigor does not apply; still gets standard unit + e2e coverage per the existing test conventions. | PASS (N/A rigor) |
| IV. Accessible, Data-Dense UI | Decision cards distinguish by shape + label text + color together (not color alone); existing axe-core "Process Map (Diagram view)" check must keep passing against the new markup — treated as a hard gate for this feature, re-verified at implementation time. | PASS (verify at implementation) |
| V. Workspace Isolation | No new query added outside the existing per-page, workspace-scoped data loads; no new auth boundary. | PASS |
| VI. Simplicity & Incremental Delivery | Reuses existing pure layout functions (`assignSwimlanes`) rather than inventing new layout math; three rendering surfaces get concrete, separate implementations of the same visual spec rather than a premature shared "renderer" abstraction (matches how the app already handles multi-surface diagrams). | PASS |

No violations — Complexity Tracking not needed.

## Project Structure

### Documentation (this feature)

```text
specs/002-process-map-cards/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

No `contracts/` directory: this feature exposes no new external interface (no new route,
API, or server action) — it redraws existing, already-loaded data on three existing pages.

### Source Code (repository root)

Existing single Next.js application — no new project, no new top-level directory.

```text
app/(app)/workspaces/[workspaceId]/processes/[processId]/map/
├── page.tsx                        # add stepId-keyed authority summary lookup, pass down
├── map-view.tsx                    # thread the new lookup prop through (client boundary)
├── process-map-canvas.tsx          # taller lanes, auto-height canvas, alternating tint
├── map-nodes.tsx                   # TaskNode/DecisionNode/TerminalNode/LaneNode redesign
└── static-process-map-diagram.tsx  # same visual language, print/PDF surface

lib/domain/
└── process-layout.ts               # LANE_HEIGHT / node-size constants updated for the bigger cards

lib/export/pptx/
└── report-pptx.ts                  # drawProcessDiagram: bigger card shapes, SLA/hand-off text, gate-style decision card

lib/reports/
└── load-report-data.ts             # (if needed) surface stepId-keyed authority data to the static/PPTX surfaces

tests/e2e/
├── accessibility.spec.ts           # existing Process Map a11y check must keep passing
├── core-workflows.spec.ts          # extend for card content (SLA/hand-off/step number/threshold)
├── report-diagram.spec.ts          # extend for the static diagram's new card sizing
└── report-print.spec.ts            # existing print-layout checks must keep passing
```

**Structure Decision**: No new project or directory — this is a targeted redesign of
existing rendering code across three already-established "draw a process map" call sites,
following the same file layout the app already uses for that pattern (an interactive
canvas + its own node components, a static/print twin, and the PPTX builder).

## Complexity Tracking

*No violations — table intentionally omitted.*
