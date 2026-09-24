# Implementation Plan: Parallel Step Numbering

**Branch**: `016-parallel-step-numbering` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-parallel-step-numbering/spec.md`

## Summary

Two or more steps that both directly feed a "requires all" step (spec 015),
with no path between them, currently get consecutive whole numbers that
falsely imply a sequence. This adds a purely computed display label —
"4a"/"4b" instead of "4"/"5" — shown everywhere a step number already
appears (Steps List, printed Flow, printed Roles), with the sequence
continuing afterward as if the group used one slot. No schema change: the
label is derived at render time from the same `joinRequiresAll` fact and
`StepConnection` graph spec 015 already established. A step's stored
`order` and every internal layout computation that reasons about position
are untouched — only the string a renderer prints changes.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16 App Router, React 19

**Primary Dependencies**: None new — reuses `ProcessStep.joinRequiresAll`
and `StepConnection` (spec 015), the existing printed-map domain/renderer
split, and the existing Steps List rendering.

**Storage**: None — no migration, read-only against existing tables.

**Testing**: Vitest (unit — group detection/label assignment,
mutation-checked; printed-map layout extension), Playwright (e2e — Steps
List + both printed layouts).

**Target Platform**: Web (existing FFProcess app).

**Project Type**: Web application (single Next.js app).

**Performance Goals**: N/A — one extra O(V+E) reachability pass per
`joinRequiresAll` step per render, over data already fully loaded in memory
for the same page; no new query.

**Constraints**: SC-002 — zero visible change for any process that doesn't
use "requires all" with a qualifying group, enforced by the label function
itself degrading to `String(order)` for every step when no group exists,
not by a runtime feature flag.

**Scale/Scope**: One new domain module, changes confined to
`print-map-layout.ts`'s existing types, both printed-map renderers,
`printed-process-map.tsx`, `map-view.tsx`, and `step-list-row.tsx`'s number
chip. No schema, no new server action, no change to
`process-map-canvas.tsx`, `step-form.tsx`, or any wording that already
names steps by label (spec 015's "needs both X and Y").

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Type-Safe Full-Stack**: No new external boundary — this is a
  purely internal, in-memory derivation over already-validated data. PASS.
- **II. Shared Domain Model**: No new entity; reuses `ProcessStep` and
  `StepConnection` exactly as spec 015 left them. PASS.
- **III. Test-First for Business Rules**: Group detection and label
  assignment (`computeStepNumberLabels`) is a business rule — what the
  Steps List and the printed report assert about a step's position — and
  gets unit tests written first, mutation-checked, mirroring
  `decision-branches.test.ts`/`predecessor-editor.test.ts`'s treatment.
  PASS.
- **IV. Accessible, Data-Dense UI**: The number chip and printed card
  number keep their existing markup and semantics; only the text content
  changes (a string like "4a" instead of "4"). No new interaction, no new
  control. PASS.
- **V. Workspace Isolation & Least Privilege**: No new action, no new
  access path — this is a read-only display derivation over data the page
  already loaded under existing workspace-scoped queries. PASS.
- **VI. Simplicity & Incremental Delivery**: Non-contiguous groups
  deliberately fall back to plain numbering rather than inventing a second,
  unrequested renumbering policy (research.md Decision 2) — the smallest
  rule that covers every acceptance scenario. PASS.

No violations — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/016-parallel-step-numbering/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

No `contracts/` — internal display-only feature, no external API; the one
new pure function's contract is its own TypeScript signature in
data-model.md.

### Source Code (repository root)

```text
lib/
├── domain/
│   ├── parallel-step-numbering.ts  # NEW — computeStepNumberLabels
│   └── print-map-layout.ts         # CHANGED — numberLabel on PrintStepInput/mergesFrom/BackReference

app/(app)/workspaces/[workspaceId]/processes/[processId]/map/
├── map-view.tsx                    # CHANGED — computes label map, passes numberLabel
└── step-list-row.tsx               # CHANGED — number chip renders numberLabel

app/reports/[workspaceId]/printed-map/
├── printed-process-map.tsx         # CHANGED — computes label map, threads numberLabel
├── flow-layout.tsx                 # CHANGED — card number + mergeWording + back-ref text
└── roles-layout.tsx                # CHANGED — same

tests/
├── unit/
│   ├── parallel-step-numbering.test.ts  # NEW
│   └── print-map-layout.test.ts         # CHANGED — extended
├── fixtures/
│   └── parallel-step-process.ts    # NEW — a process with a genuine parallel pair
└── e2e/
    └── parallel-step-numbering.spec.ts  # NEW
```

**Structure Decision**: Single Next.js app — entirely within the existing
Process Map feature area and printed-report renderer, following the same
boundaries specs 013–015 already established.

## Complexity Tracking

*No violations — table intentionally empty.*
