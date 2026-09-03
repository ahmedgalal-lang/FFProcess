# Tasks: Process Map Documented Cards

**Input**: Design documents from `/specs/002-process-map-cards/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included, but not strict TDD — Constitution Principle III exempts pure
rendering/styling from write-first-must-fail rigor (this feature adds no new business
rule). Tests here verify each story's acceptance scenarios and guard the two things that
*are* non-negotiable per the constitution: accessibility (Principle IV) and not
regressing the print/PPTX surfaces already covered by existing specs.

**Organization**: Tasks are grouped by user story (spec.md's US1–US4), in priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4, matching spec.md's prioritized user stories
- File paths are exact, repo-relative

---

## Phase 1: Setup

No project scaffolding needed — this is a rendering change inside an existing,
already-running Next.js app. Nothing to initialize.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one piece of shared infrastructure US2 and US3 both need — a
`stepId`-keyed SLA/threshold/approver lookup — plus the sizing constants every story's
cards read from. US1 does not depend on this phase and may be built first or in parallel.

- [ ] T001 [P] Add a `buildStepAuthoritySummary(steps, activities, authorityAssignments)` helper to `lib/domain/authority-table.ts` (or a small new co-located file) that calls the existing `buildAuthorityTableRows` and returns a `Map<stepId, { slaDays, threshold, direction }>` keyed by each row's own `stepId` field (never `rowId` — see research.md's rowId-ambiguity finding). Ties broken by existing `order` field when more than one row maps to the same step.
- [ ] T002 [P] Unit test `buildStepAuthoritySummary` in `lib/domain/authority-table.test.ts` (or new test file): a step with an activity gets its SLA/threshold; a step with no related activity falls back correctly; two rows mapping to the same step resolve by `order`.
- [ ] T003 Update size/spacing constants in `lib/domain/process-layout.ts` (`LANE_HEIGHT`, `LANE_TOP_OFFSET`, `LANE_NODE_Y_OFFSET`, `STEP_X_SPACING`) to the approved mockup's Option B values (lane height ≈214px; step spacing widened to fit ≈214×112px task cards) — read by every rendering surface, so this is a single shared source of truth, not per-surface duplication (Constitution Principle VI).

**Checkpoint**: `buildStepAuthoritySummary` and the new layout constants exist and are unit-tested. US1 can proceed independently of this phase; US2/US3 need it.

---

## Phase 3: User Story 1 — Read a step without straining (Priority: P1) 🎯 MVP

**Goal**: Bigger, legible step cards; canvas height follows lane count instead of a fixed 520px.

**Independent Test**: Open any process with 3+ lanes on the live Process Map — every step reads without zooming, no lane is clipped, no forced shrink-to-fit.

### Implementation for User Story 1

- [ ] T004 [US1] Resize `TaskNode` in `app/(app)/workspaces/[workspaceId]/processes/[processId]/map/map-nodes.tsx` to the ≈214×112px card (white surface, border, radius, shadow) per the mockup — role line included, no chip row yet (that's US2).
- [ ] T005 [US1] Resize `TerminalNode` in the same file to the emerald pill treatment (color only for now — bold label; full "visually distinct from task/decision" requirement completes with T007 in US3, but terminal's own shape/color lands here).
- [ ] T006 [US1] Resize `LaneNode` in the same file to the new `LANE_HEIGHT`, with alternating lane tint (`:nth-child` or index-based) so lanes stay distinguishable at the taller height (FR-009).
- [ ] T007 [US1] Remove the fixed `h-[520px]` canvas height in `app/(app)/workspaces/[workspaceId]/processes/[processId]/map/process-map-canvas.tsx`; compute height from `layout.laneCount * LANE_HEIGHT` (same pattern `StaticProcessMapDiagram` already uses for its own height, minus that component's print-page cap — the live canvas has no page-fit constraint) (FR-008).
- [ ] T008 [US1] Update `minZoom`/`fitViewOptions` on the live canvas if the new card/lane sizes change what "fit" needs (verify against a 9-step/3-lane process and a 1-step/1-lane process).

### Tests for User Story 1

- [ ] T009 [P] [US1] Extend `tests/e2e/core-workflows.spec.ts` (the existing Process Map test, or a new case) to assert the canvas height on a multi-lane seeded process (e.g. Purchase-to-Pay) is not clamped to 520px and scales with lane count.
- [ ] T010 [P] [US1] Re-run `tests/e2e/accessibility.spec.ts`'s existing "Process Map (Diagram view)" axe-core check against the resized nodes — must keep passing (Constitution Principle IV).

**Checkpoint**: Live Process Map cards are legibly sized and the canvas fits its lanes. Independently shippable.

---

## Phase 4: User Story 2 — See a step's operational detail on the diagram (Priority: P2)

**Goal**: Step number, SLA, and cross-process hand-off visible directly on each task card.

**Independent Test**: Open a process with at least one SLA'd step and one linked step (Purchase-to-Pay) — both show on their cards; a step with neither shows a neutral "not set" chip.

**Depends on**: Phase 2 (T001), Phase 3's `TaskNode` shape (T004).

### Implementation for User Story 2

- [ ] T011 [US2] In `app/(app)/workspaces/[workspaceId]/processes/[processId]/map/page.tsx`, call `buildStepAuthoritySummary` using the `activities`/`authorityAssignments` already fetched on that page (no new Prisma query) and pass the resulting per-step summary down through `MapView`.
- [ ] T012 [US2] Thread the new per-step summary prop through `app/(app)/workspaces/[workspaceId]/processes/[processId]/map/map-view.tsx` into `ProcessMapCanvas`.
- [ ] T013 [US2] Extend `StepNodeData` in `map-nodes.tsx` with the step's order number, SLA, and hand-off target; extend `process-map-canvas.tsx`'s node-building code to populate it per step (order already available from array index/`order` field; hand-off already available from `s.links`).
- [ ] T014 [US2] Add the step-number badge and meta-chip row (SLA chip / hand-off chip / neutral "not set" chip) to `TaskNode` in `map-nodes.tsx`, replacing the current absolutely-positioned `StepChips` link-only treatment with the in-card chip row from the mockup (the existing cross-process link still navigates the same way — same href, new placement).

### Tests for User Story 2

- [ ] T015 [P] [US2] Extend `tests/e2e/core-workflows.spec.ts` (Purchase-to-Pay is already seeded with an SLA'd step and a step linking to PUR102/SAL101): assert the SLA chip and hand-off chip render with the right text on the right steps, and a step with neither shows the "not set" chip.
- [ ] T016 [P] [US2] Re-run the Process Map accessibility check — chip text must not be color-only (verify chip labels are real text, not icon-only).

**Checkpoint**: Live Process Map cards show SLA and hand-off. Independently testable and shippable on top of US1.

---

## Phase 5: User Story 3 — Tell a decision apart, with its threshold visible (Priority: P3)

**Goal**: Decision steps read as a distinct, labelled gate card with their approval threshold.

**Independent Test**: Open Purchase-to-Pay — "Approve PO?" (decision, $10,000 threshold) is visually distinct from task/terminal cards and shows the threshold.

**Depends on**: Phase 2 (T001, for the threshold/direction data), Phase 3's card sizing conventions.

### Implementation for User Story 3

- [ ] T017 [US3] Redesign `DecisionNode` in `map-nodes.tsx`: replace the small rotated diamond with the amber-tinted rounded-rectangle gate card (label, role, and a "gate" line built from the step's threshold + direction, sourced from the same per-step summary threaded in US2).
- [ ] T018 [US3] Update edge-routing handle positions in `process-map-canvas.tsx` / `map-nodes.tsx`'s `Handles` component if the decision card's new rectangular shape changes where connectors should anchor (today's handles assume the diamond's rotated geometry).

### Tests for User Story 3

- [ ] T019 [P] [US3] Extend `tests/e2e/core-workflows.spec.ts`: assert "Approve PO?" renders as a decision card (not a task/terminal) and shows "$10,000" (or the seeded threshold) on the card.
- [ ] T020 [P] [US3] Re-run the Process Map accessibility check against the amber decision card (contrast, and confirm decision-ness is conveyed by shape/label too, not the amber tint alone).

**Checkpoint**: All three step types (task, decision, terminal) are visually distinct and carry their documented detail. US1–US3 together are the full live-canvas redesign.

---

## Phase 6: User Story 4 — The same diagram everywhere (Priority: P4)

**Goal**: The print/PDF static diagram and the PPTX export draw the same card treatment as the now-finished live canvas.

**Independent Test**: Generate an Export Report PDF and a PPTX for Purchase-to-Pay; both show the same card shapes/content as the live canvas (proportions/fonts may differ per medium).

**Depends on**: US1–US3 finalized (this phase ports their decisions, so the visual spec must be settled first).

### Implementation for User Story 4

- [ ] T021 [P] [US4] In `lib/reports/load-report-data.ts`, add the same `buildStepAuthoritySummary` call (or extend `ExportProcessData.steps` with the per-step SLA/threshold directly) so the static/PPTX surfaces get the same `stepId`-correct data US2/US3 use — not the ambiguous `rowId` lookup the report's narrative-card code currently uses (see research.md).
- [ ] T022 [US4] Redesign the static diagram's node markup in `app/(app)/workspaces/[workspaceId]/processes/[processId]/map/static-process-map-diagram.tsx` to mirror the new card/lane/decision treatment (same card shapes, same chip content, same auto-height-within-print-constraints behavior it already has).
- [ ] T023 [US4] Redesign `drawProcessDiagram` in `lib/export/pptx/report-pptx.ts`: bigger task-card rectangles with step number/role/SLA/hand-off text, the decision card as a rounded rectangle (not a diamond) with its gate line, terminal as a pill — reusing the same `fitMapper` scaling already in that file.

### Tests for User Story 4

- [ ] T024 [P] [US4] Extend `tests/e2e/report-diagram.spec.ts` for the static diagram's new card sizing (the existing "fits a wide process" and "Unassigned lane" tests should keep passing against the resized nodes; add an assertion for SLA/hand-off content if reachable from the DOM).
- [ ] T025 [P] [US4] Extend `tests/e2e/report-print.spec.ts` if the new card sizes change print pagination for a diagram-heavy process — re-verify against a real generated PDF (per the project's established Playwright `page.pdf()` + visual-inspection technique) rather than assuming.
- [ ] T026 [P] [US4] Extend the PPTX structural check in `tests/e2e/export.spec.ts` (or verify manually via the `python-pptx` technique used when the PPTX export first shipped) to confirm the process-map slide's shape count/content reflects the new card treatment.

**Checkpoint**: All three surfaces agree. Feature complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T027 [P] Run `pnpm run lint` and `pnpm run build` clean across all changed files.
- [ ] T028 [P] Run `pnpm exec vitest run` (full suite) and `pnpm exec playwright test` (full suite) — all existing + new tests green.
- [ ] T029 Walk `quickstart.md` end to end against the seeded dev database as a final manual check.
- [ ] T030 Update any stale in-code comments referencing the old fixed `520px` canvas height or the old diamond decision shape, so the codebase's own comments don't describe a design that no longer exists.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None — skipped, nothing to scaffold.
- **Foundational (Phase 2)**: No dependencies. Blocks US2 and US3 (not US1).
- **US1 (Phase 3)**: Can start immediately, in parallel with Phase 2.
- **US2 (Phase 4)**: Needs Phase 2 (T001) and US1's `TaskNode` shape (T004).
- **US3 (Phase 5)**: Needs Phase 2 (T001) and US1's sizing conventions; independent of US2's chip-row work (touches `DecisionNode`, not `TaskNode`).
- **US4 (Phase 6)**: Needs US1–US3 finished (it ports their finished visual spec to two more surfaces).
- **Polish (Phase 7)**: After all desired stories are complete.

### Parallel Opportunities

- T001–T003 (Foundational) and T004–T008 (US1) can run in parallel — different files, no shared dependency.
- Within US2: T015/T016 (tests) can run parallel to each other once T011–T014 land.
- Within US4: T021 (data plumbing) can run parallel to nothing else in that phase (T022/T023 both depend on it), but T024–T026 (tests) can run in parallel to each other once T022/T023 land.

## Implementation Strategy

### MVP First

1. Phase 2 (Foundational) + Phase 3 (US1) → ship the size/legibility fix alone if that's all that's needed short-term — this is already a complete, valuable increment (the original "looks bad and small" complaint, resolved).
2. Add US2 → cards show SLA/hand-off.
3. Add US3 → decisions read as gates with thresholds.
4. Add US4 → PDF and PPTX match.

Each checkpoint is independently demoable, matching how PPTX and PDF-pagination work
shipped incrementally earlier in this same project.
