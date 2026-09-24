# Implementation Plan: Step Join Requirement

**Branch**: `015-step-join-requirement` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-step-join-requirement/spec.md`

## Summary

Let a step's editor show and manage *every* incoming connection, not just
one, and let a step declare whether it's reachable once any one predecessor
finishes (today's only behavior, unchanged default) or only once every one
of them has — a real join, not just a visual merge. Reuses the existing
many-to-one `StepConnection` relation and the existing
`createStepConnection`/`deleteStepConnection` actions unchanged; adds one
boolean field (`ProcessStep.joinRequiresAll`, default `false`, additive
migration) and a new predecessor-editor domain module + UI component
structured like spec 014's Decision branch editor but scoped to the incoming
side. The printed map's existing merge computation (`mergesFrom`, spec 013)
is widened to carry predecessor labels so the "requires all" case can name
them; the unmarked case's wording is untouched.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16 App Router, React 19

**Primary Dependencies**: Prisma 7 (PostgreSQL), Zod, existing
`lib/actions/process.ts` server actions, existing printed-map domain/renderer
split (`lib/domain/print-map-layout.ts` + `flow-layout.tsx`/`roles-layout.tsx`)

**Storage**: PostgreSQL via Prisma — one additive column on `process_steps`

**Testing**: Vitest (unit — domain diff logic, printed-map layout; integration
— server action), Playwright (e2e — editor + printed report)

**Target Platform**: Web (existing FFProcess app, workspace-scoped)

**Project Type**: Web application (single Next.js app — no frontend/backend
split)

**Performance Goals**: N/A — same request shapes and data volumes as the
existing step-editing and printed-report paths; no new query pattern beyond
what `createStepConnection`/`deleteStepConnection` already do per connection.

**Constraints**: SC-002 — zero visual change to any process that doesn't use
"requires all," the moment this ships (enforced by the migration's own
`default(false)`, not by any runtime check).

**Scale/Scope**: One new column, one new domain module + component, changes
confined to the Process Map's Steps List row, `map-view.tsx`'s connection
lookup, and the printed map's two layout renderers. No changes to
`process-map-canvas.tsx` (research.md Decision 5) or to `step-form.tsx`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Type-Safe Full-Stack**: `updateStepSchema`'s new field is Zod-validated
  like every other field on it; no hand-maintained parallel type. PASS.
- **II. Shared Domain Model**: No new entity — `joinRequiresAll` is a fact on
  the existing `ProcessStep`, `StepConnection` is unchanged and reused as-is.
  PASS.
- **III. Test-First for Business Rules**: `reconcilePredecessorDrafts` (a
  business rule — which connections to create/delete from staged UI state)
  gets unit tests written before/alongside implementation, mirroring
  `decision-branches.test.ts`'s coverage; `print-map-layout.ts`'s wording
  split is also a business rule (what the report asserts) and gets the same
  treatment. PASS.
- **IV. Accessible, Data-Dense UI**: The new predecessor editor and the
  "requires all" checkbox reuse the same form-control patterns (`<Field>`,
  labeled `<select>`/`<input>`) already accessible in this file; no new
  interaction pattern introduced. PASS.
- **V. Workspace Isolation & Least Privilege**: Managing predecessors reuses
  already EDITOR-gated actions unchanged; the rule itself is saved through
  `updateProcessStep`, already EDITOR-gated and workspace-scoped
  (`requireWorkspaceAccess`/`loadProcessInWorkspace`). FR-009 requires no new
  check. PASS.
- **VI. Simplicity & Incremental Delivery**: No new server action; the
  predecessor editor is deliberately *not* generalized with the Decision
  branch editor (research.md Decision 4) because their destination shapes
  differ — sharing code would add a dead "create new step" path to the
  incoming side. 7a/7b numbering and the outgoing-side "fork" concept are
  explicitly out of scope (spec.md Assumptions), keeping this the smallest
  slice that makes the reported gap expressible. PASS.

No violations — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/015-step-join-requirement/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

No `contracts/` — this is an internal product feature with no external API;
the server actions it reuses/extends already have their contracts expressed
as Zod schemas in `lib/actions/process.ts` itself.

### Source Code (repository root)

```text
lib/
├── domain/
│   ├── predecessor-editor.ts       # NEW — reconcilePredecessorDrafts, types
│   └── print-map-layout.ts         # CHANGED — joinRequiresAll, mergesFrom shape
├── actions/
│   └── process.ts                  # CHANGED — updateStepSchema/updateProcessStep only

app/(app)/workspaces/[workspaceId]/processes/[processId]/map/
├── predecessor-editor.tsx          # NEW — mirrors decision-branch-editor.tsx
├── step-list-row.tsx               # CHANGED — replaces single "Connects from" UI
└── map-view.tsx                    # CHANGED — incomingConnectionsOf (plural)

app/reports/[workspaceId]/printed-map/
├── flow-layout.tsx                 # CHANGED — either/all-by-name wording split
├── roles-layout.tsx                # CHANGED — same
└── printed-process-map.tsx         # CHANGED — passes joinRequiresAll through

prisma/
├── schema.prisma                   # CHANGED — ProcessStep.joinRequiresAll
└── migrations/<ts>_step_join_requires_all/migration.sql   # NEW

tests/
├── unit/
│   ├── predecessor-editor.test.ts  # NEW
│   └── print-map-layout.test.ts    # CHANGED — extended
├── integration/
│   └── process.test.ts             # CHANGED — extended (or wherever updateProcessStep is covered)
└── e2e/
    └── step-join-requirement.spec.ts  # NEW
```

**Structure Decision**: Single Next.js app (no frontend/backend split) — this
feature is entirely within the existing Process Map feature area
(`app/(app)/workspaces/[workspaceId]/processes/[processId]/map/`) plus the
existing printed-report renderer
(`app/reports/[workspaceId]/printed-map/`), following the same file
boundaries spec 013 (merge naming) and spec 014 (Decision branch editor)
already established.

## Complexity Tracking

*No violations — table intentionally empty.*
