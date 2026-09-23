# Tasks: Printed Process Map, Rebuilt

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Contracts**:
[print-map-layout.md](./contracts/print-map-layout.md), [map-layout-action.md](./contracts/map-layout-action.md)

Tests are included. What the layout module *decides* — which connection continues the spine,
which label belongs to which branch, whether a process is over the role ceiling — is business
logic under Constitution Principle III: tests first, then implementation, then mutation-checked.
Pure rendering is not, and is covered by the measured e2e instead.

## Phase 1: Foundational — the layout module (blocks every slice)

- [ ] T001 Write `tests/unit/print-map-layout.test.ts` against [the contract](./contracts/print-map-layout.md): every step once in order; a branch carries its own connection's label and never a neighbour's; of a decision's outgoing connections the highest-order target continues the spine and the rest spur; indent never exceeds `MAX_BRANCH_INDENT`; a step with no outgoing connection is `endsHere`; a merge records every step converging on it. Confirm these fail before T002 exists.
- [ ] T002 Implement `lib/domain/print-map-layout.ts`: `buildPrintMapLayout(input): LayoutOutcome`, plus `MAX_ROLE_COLUMNS` and `MAX_BRANCH_INDENT`. Pure — no DOM, no Prisma, no clock.
- [ ] T003 Extend the same test file for the edge cases the contract enumerates: no steps, one step, a step with no role, a connection leaving the process, two connections between one pair, and a cycle that must terminate.
- [ ] T004 Extend for `ROLES`: columns are the roles the process actually uses in first-appearance order; a roleless step gets its own column rather than vanishing; more than `MAX_ROLE_COLUMNS` roles returns a `FLOW` outcome carrying `fellBackFrom` and a human-readable `reason`, and never throws.
- [ ] T005 Make T001/T003/T004 pass, then mutation-check: break the spine rule, borrow a neighbour's branch label, drop the indent clamp, raise the role ceiling — confirm each is caught, then restore.

**Checkpoint**: the map's claims about a process are correct and proven without rendering anything.

## Phase 2: User Story 1 + 2 — the map reads, in order (P1) · MVP

- [ ] T006 [US1] Build `app/reports/[workspaceId]/printed-map/flow-layout.tsx` — a server component rendering `FlowOutline` as one row per step: rail column, then a card carrying step number, full label, role (or "no role set") and the cross-process links the card shows today.
- [ ] T007 [US1] Build `app/reports/[workspaceId]/printed-map/printed-map.css` — rails and elbows as CSS borders, `break-inside: avoid` per row, type in `rem` so the report's Spacing control reaches the map for the first time. No fixed heights, no `overflow: hidden` anywhere in the map.
- [ ] T008 [US1] Build `app/reports/[workspaceId]/printed-map/printed-process-map.tsx` — takes steps, connections and the chosen layout, calls the module, renders the right layout, and renders the fallback notice when one was returned.
- [ ] T009 [US1] Swap `app/reports/[workspaceId]/export-preview.tsx` to render `PrintedProcessMap` instead of `StaticProcessMapDiagram`, passing the data it already loads.
- [ ] T010 [US2] Delete `static-process-map-diagram.tsx` and any import of it. Confirm `wrapProcessMap` (PPTX deck) and `routeConnectors` (live canvas) still have their callers and are untouched.
- [ ] T011 [US1+US2] Write `tests/e2e/printed-map.spec.ts` against `tests/fixtures/tender-process.ts`, asserting the spec's measured criteria: 0 cards with overflowing text (today 18), 0 clipped (today 1), 0 stubs in empty space (today 1), 0 direction warnings (today 2 rows), and that no stored `positionX`/`positionY` changed.

**Checkpoint**: the reported defect is fixed and measured. Shippable on its own.

## Phase 3: User Story 3 + 4 — connections drawn, branches read as branches (P2)

- [ ] T012 [US4] Render branch spurs in `flow-layout.tsx`: the elbow off the spine, the branch's own label on it, and `ends here` on a branch with no outgoing connection.
- [ ] T013 [US3] Render the merge rail where two or more paths converge, naming the steps it merges from.
- [ ] T014 [US3] Render back-references for connections no rail can draw — naming the destination step by number and label, carrying that connection's own label, with direction shown.
- [ ] T015 [US3] Extend `printed-map.spec.ts`: every connection in the fixture is either drawn or back-referenced with zero dropped, and no label appears against a connection it does not belong to.

## Phase 4: User Story 3 — the Roles layout (P2)

- [ ] T016 [US3] Build `app/reports/[workspaceId]/printed-map/roles-layout.tsx` — a CSS grid, one column per role used, one row per step, connectors as grid-placed elements spanning the columns they join.
- [ ] T017 [US3] Render the ceiling fallback notice: which layout was asked for, how many roles the process has, and what the ceiling is.
- [ ] T018 [US3] Extend `printed-map.spec.ts` to run every measurement against `ROLES` as well as `FLOW`, and to assert a 6-role process asked for `ROLES` prints as `FLOW` with the reason stated.

## Phase 5: User Story 5 — choosing the layout (P3)

- [ ] T019 [US5] Add `ReportMapLayout` enum and `Workspace.reportMapLayout` (default `FLOW`) to `prisma/schema.prisma`; migrate. Additive, no backfill.
- [ ] T020 [US5] Build `lib/actions/report-map-layout.ts`'s `setReportMapLayout` per [the contract](./contracts/map-layout-action.md) — Zod-validated, `EDITOR`-gated, one workspace.
- [ ] T021 [US5] Add the **Map layout** control to the report toolbar beside Spacing, rendered only when the viewer may edit; read `workspace.reportMapLayout` in the report's existing query.
- [ ] T022 [US5] Write `tests/integration/report-map-layout.test.ts`: the action persists, refuses a VIEWER, refuses an unknown layout, and does not touch another workspace.
- [ ] T023 [US5] Extend `tests/e2e/viewer-read-only.spec.ts` — a Viewer sees the map in the client's chosen layout and is not offered the control.

## Phase 6: Polish

- [ ] T024 Run `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm exec playwright test` and report counts. Do not edit while a run is in flight.
- [ ] T025 Blast-radius check per [quickstart](./quickstart.md) §5: `wrapped-process-map.spec.ts`, `connector-routing.spec.ts` and `core-workflows.spec.ts` must be unchanged — the canvas and the deck are out of scope.
- [ ] T026 Read the real exported PDF for the tender fixture and the 6-role fixture, and record each success criterion's measured result in `checklists/requirements.md`. A criterion not measured is not met.

## Dependencies

- Phase 1 blocks everything: both renderers consume what T002 returns.
- T001 must fail before T002 starts; T005 closes the loop.
- Phase 2 is the MVP and is shippable without Phases 3–5.
- T019 blocks T020/T021. Phase 5 can follow Phase 2 directly if Roles slips.

## MVP scope

Phases 1–2. That alone takes the map from 18-of-18 truncated to 0 and is worth shipping on
its own; everything after it adds fidelity or choice.
