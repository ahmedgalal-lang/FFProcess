# Implementation Plan: Connector Routing on the Process Map

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-connector-routing/spec.md`

## Summary

Connectors on the Process Map overlap each other and run through unrelated step cards
because every one of them is drawn by the same built-in edge, turning at the same fixed
distance from its card. The fix is a single pure router — `lib/domain/connector-routing.ts`
— that gives each connector its own line inside the empty band between two swimlanes and
its own vertical out of its card, and a custom edge component that draws what the router
decided. Both the live canvas and the static print diagram consume the same answer, so
screen and PDF agree by construction rather than by inspection.

## Technical Context

**Language/Version**: TypeScript 5, strict mode

**Primary Dependencies**: `@xyflow/react` 12.11.2 (`BaseEdge`, custom `edgeTypes`),
React 19.2, Next.js 16.3 App Router

**Storage**: N/A — no schema change, nothing persisted. The router runs per render.

**Testing**: Vitest for the router (`tests/unit/connector-routing.test.ts`), Playwright for
the drawn result (`tests/e2e/connector-routing.spec.ts`), measured off the rendered page

**Target Platform**: Browser (live canvas) and Chromium print-to-PDF (report export)

**Project Type**: Web application — Next.js App Router, with framework-free domain logic
in `lib/domain/`

**Performance Goals**: Re-route within one frame of a card drag on a 25-step, 30-connector
process — the router is O(steps + connections) after one sort, so this is not in doubt;
the point is that it runs per render rather than being cached and going stale.

**Constraints**: A route may never leave its band or its gutter. Nothing may be drawn
outside the map's bounds. No connector's meaning may change.

**Scale/Scope**: Processes in the product today run to ~25 steps and ~30 connectors on up
to 6 swimlanes. Two renderers, one of which also wraps the map onto several rows.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1.*

| Principle | Assessment |
|---|---|
| I. Type-Safe Full-Stack | Pass. The router is strict TypeScript with a discriminated union return; no `any`. No trust boundary is crossed — this is geometry over data the server already validated, so no new Zod schema is warranted. |
| II. Shared Domain Model | Pass, and this is the principle the feature serves. The routing answer is computed once in `lib/domain/` and consumed by both renderers, replacing two near-duplicate `chooseHandles`/`chooseHandlesAt` implementations that had already drifted. |
| III. Test-First for Business Rules | Pass with a note. Routing is presentation, not a governed business rule, so it does not carry the mandatory test-first bar. It is nonetheless specified as a pure function with asserted guarantees and unit-tested first, because a geometric invariant is exactly the kind of thing that is cheap to test and impossible to eyeball. The e2e measurement is written before the renderers change, so the baseline is real. |
| IV. Accessible, Data-Dense UI | Pass, and materially advanced: an unreadable tangle of arrows is an accessibility problem. `BaseEdge` keeps the existing keyboard selection and the invisible interaction path; the per-edge `ariaLabel` naming both endpoints is carried over unchanged (FR-012). Stroke colours and dash patterns are untouched, so no contrast regression is possible. |
| V. Workspace Isolation & Least Privilege | Not engaged. No query, no new server action, no authorization decision. The router sees only geometry already on the page. |
| VI. Simplicity & Incremental Delivery | Pass. One module, one edge component, two call sites — the two call sites are what justifies extracting the module at all. One generalization is deliberately *not* built (spilling overflow connectors into a neighbouring band) and is recorded in `research.md` Decision 6 with the reason, rather than left implicit. |

No violations. Complexity Tracking table omitted.

## Project Structure

### Documentation (this feature)

```text
specs/010-connector-routing/
├── plan.md              # This file
├── spec.md
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── connector-routing.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks output — not created here
```

### Source Code (repository root)

```text
lib/domain/
├── connector-routing.ts          # NEW — the router. Pure, framework-free.
└── process-layout.ts             # unchanged; supplies NODE_HALF_SIZE / PRINT_NODE_HALF_SIZE

app/(app)/workspaces/[workspaceId]/processes/[processId]/map/
├── routed-edge.tsx               # NEW — custom ReactFlow edge; turns a route into a path
├── process-map-canvas.tsx        # drops chooseHandles, calls the router, uses routed-edge
└── static-process-map-diagram.tsx # drops chooseHandlesAt, same

tests/
├── unit/connector-routing.test.ts    # NEW — the router's guarantees
└── e2e/connector-routing.spec.ts     # NEW — measures the drawn result
```

**Structure Decision**: The existing split is kept exactly as it stands — framework-free
geometry in `lib/domain/`, rendering in the route's own folder. The new edge component
lives beside the nodes it connects (`map-nodes.tsx`) rather than in a shared components
directory, because only this map uses it; Principle VI says to wait for a second call site
before moving it.

## Phase 1 re-check

Re-evaluated after the contract and data model were written. Two things changed as a
result of writing them down, both recorded in `research.md`:

- The router derives rows and columns from drawn positions by clustering rather than
  taking lane and column indices from the caller (Decision 3). Writing the contract made
  it obvious that a lane index is a lie the moment a user drags a card.
- Corridor spacing is computed to fit the band rather than fixed at the mockup's 12px
  (Decision 6). The mockup's fixed numbers are what left one crossing in it.

Constitution Check re-run against the final design: still no violations.
