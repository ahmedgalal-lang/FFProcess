# Implementation Plan: Wrapped Process Map

**Branch**: `claude/process-mapping-raci-tool-v1i9lb` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-wrapped-process-map/spec.md`

## Summary

The report's process map lays a whole process out in one row and shrinks it until it fits.
A 22-step process ends up at about a centimetre per step on paper. This adds one pure
function that deals the steps into rows of a readable width, each row carrying its own
swimlanes, and has the report's static diagram and the deck use it. A process short enough
to fit one row takes the existing path untouched.

The interesting problem is not the wrap; it is that this is a swimlane diagram. A row needs
its own lanes, and a connection between rows cannot be routed around the steps because the
space it would route through is another row's lanes. Both are solved the way printed
flowcharts have always solved them: lanes repeat per row, and a cross-row connection breaks
into a marked pair.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 22

**Primary Dependencies**: Next.js 16, React 19, React Flow (static diagram), pptxgenjs (deck)

**Storage**: none. **No migration, no column.** The wrap is computed at render time.

**Testing**: Vitest for the wrapping arithmetic (`pnpm test`), Playwright end-to-end,
`@axe-core/playwright` for the accessibility bar

**Target Platform**: Server-rendered web application, printed to PDF

**Performance Goals**: one pass over the steps, per process, per render. Not measurable.

**Constraints**: a process short enough to fit one row must render identically to today
(FR-003, SC-005). Stored step positions must never be written (FR-014).

**Scale/Scope**: one pure function plus a marker helper in an existing domain module, the
report's static diagram, and the deck's process-map slide.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1.*

| Principle | How this feature satisfies it |
| --- | --- |
| **I. Type-Safe Full-Stack** | The layout is one inferred type shared by the report and the deck, not two parallel shapes. No new boundary to validate — nothing crosses one. |
| **II. Shared Domain Model** | Lane assignment is reused from `assignSwimlanes`, not reimplemented per row. Step size comes from `NODE_HALF_SIZE`, already shared by all three renderers. |
| **III. Test-First for Business Rules** | The arithmetic that decides what a client sees — capacity, row and column, per-row lanes, which connections cross rows — is written test-first and mutation-checked. |
| **IV. Accessible, Data-Dense UI** | The map is a printed diagram, but the cross-row markers are text with a contrast requirement, and the report page keeps its axe check. |
| **V. Workspace Isolation & Least Privilege** | Nothing new is read or written. The feature sees only the steps the report already loaded. |
| **VI. Simplicity & Incremental Delivery** | One function, no stored state, no new constant for "readable" — `STEP_X_SPACING` already is it. Page-splitting and re-ordering are recorded as out of scope rather than built. |

**Post-Phase-1 re-check**: passing. Phase 0 removed a constant the spec implied — a
"minimum readable step size" turned out to be `STEP_X_SPACING`, which the interactive map
already uses and nobody complains about.

### Noted, not fixed here

**The deck's map is not the report's.** `report-pptx.ts` lays out its own slide rather than
reusing the React component, so it gets the same wrapping function but its own drawing
code. Sharing the rendering as well as the geometry is a larger change and is not attempted
here.

## Project Structure

### Documentation (this feature)

```text
specs/007-wrapped-process-map/
├── plan.md              # This file
├── spec.md              # The specification
├── research.md          # Phase 0 — six decisions
├── data-model.md        # Phase 1 — no schema change, two read models
├── quickstart.md        # Phase 1 — how to prove it works
├── contracts/
│   └── domain.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — created by /speckit-tasks
```

### Source code

```text
lib/domain/process-layout.ts          # + wrapProcessMap, + crossRowMarkers

app/(app)/workspaces/[workspaceId]/processes/[processId]/map/
└── static-process-map-diagram.tsx    # uses the wrap; grows its box per row

lib/export/pptx/report-pptx.ts        # the deck's process-map slide wraps too

scripts/make-long-process.ts          # NEW — builds a process long enough to wrap

tests/
├── unit/process-layout.test.ts       # extended — capacity, rows, per-row lanes, markers
└── e2e/
    ├── wrapped-process-map.spec.ts   # NEW — wraps, stays readable, lanes per row
    └── report-print.spec.ts          # regression: page breaks and short processes
```

**Structure Decision**: the arithmetic goes in `lib/domain/process-layout.ts` with the rest
of the map geometry — pure, no DOM, no Prisma — because three renderers consume it and
because Principle III wants it tested without rendering anything. The renderers keep their
own drawing code.

## Phase notes

**Order of work**: the function and its tests first; then the report's diagram, which is
what the user actually looked at; then the deck.

**The riskiest task is the static diagram's box height.** It is currently clamped between
320 and 640px, which affords about one row of three lanes. It has to grow with the number
of rows and stop somewhere, and that stopping point is what triggers the shrink-to-fit
fallback. Getting it wrong shrinks maps that should have wrapped, which looks exactly like
the bug this feature is fixing.

## Complexity Tracking

No constitution violations. No entries.
