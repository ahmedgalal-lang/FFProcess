---

description: "Task list for Process Ordering"
---

# Tasks: Process Ordering

**Input**: Design documents from `/specs/003-process-ordering/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Required, not optional. Constitution Principle III mandates that business rules have
tests written before or alongside implementation, failing first. The ordering rules (comparator,
sibling-scoped move, next position, pack-order application) and the reorder action's
authorization and validation are business rules. Rendering the arrows is UI and exempt.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1, US2, US3)

---

## Phase 1: Setup

**Purpose**: Confirm the ground is where the plan says it is. No project initialization — this
is an existing app.

- [ ] T001 Confirm the baseline is green before changing anything: run `pnpm run lint`, `pnpm run build`, `pnpm exec vitest run`, `pnpm exec playwright test` from the repository root and record the passing counts
- [ ] T002 Re-read `lib/domain/step-order.ts` and `reorderProcessSteps` in `lib/actions/process.ts` to confirm the pattern this feature mirrors is still shaped as `research.md` describes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The stored position and the shared ordering rule. Every story reads one or both,
so all of this lands before any story begins.

**⚠️ CRITICAL**: No user story can start until this phase is complete.

- [ ] T003 Write failing unit tests for `orderProcessesForDisplay` in `tests/unit/process-order.test.ts`: top-level ordered by `order` then `code`; each parent's children emitted directly beneath it in the same comparator; equal `order` values resolved deterministically by `code`; an orphan sub-process (parent absent from the list) ordered among the top-level processes rather than dropped
- [ ] T004 Create `lib/domain/process-order.ts` with the `OrderableProcess` type and `orderProcessesForDisplay`, per `contracts/process-ordering.md`, making T003 pass — pure, framework-free, no imports from Prisma or React
- [ ] T005 [P] Write failing unit tests for `nextOrderForLevel` in `tests/unit/process-order.test.ts`: returns one past the highest sibling at that level; returns 0 for an empty level; scopes to `parentProcessId` so a child's position ignores top-level processes
- [ ] T006 Implement `nextOrderForLevel` in `lib/domain/process-order.ts`, making T005 pass
- [ ] T007 Add `order Int @default(0)` to the `Process` model in `prisma/schema.prisma`, placed and commented like `ProcessStep.order`
- [ ] T008 Create the migration in `prisma/migrations/<timestamp>_process_order/migration.sql`: add the column, then backfill per workspace and per parent level assigning `0..n-1` in current `code` ascending order, so no existing workspace visibly reorders on deploy (research R4)
- [ ] T009 Apply the migration locally with `pnpm exec prisma migrate deploy` and confirm against the seeded workspace that `SELECT code, "order" FROM processes ORDER BY "order"` matches the order the Processes page shows today
- [ ] T010 Set `order` on creation to `nextOrderForLevel(...)` in the process-creation path in `lib/actions/process.ts`, so a new process lands at the end of its level and displaces nothing (FR-006)
- [ ] T011 [P] Add an integration test in `tests/integration/process-reorder.test.ts` asserting a newly created process takes the last position at its level and leaves existing positions unchanged

**Checkpoint**: position stored, ordering rule defined and tested, nothing user-visible yet.

---

## Phase 3: User Story 1 — Arrange the process library (P1) 🎯 MVP

**Goal**: A consultant can put a workspace's processes in a deliberate order from the Processes
page, and it persists for everyone.

**Independent Test**: Reorder on the Processes page, reload, confirm it persists; confirm a
parent's sub-processes travel with it; confirm a boundary move does nothing.

- [ ] T012 [P] [US1] Write failing unit tests for `moveProcessInOrder` in `tests/unit/process-order.test.ts`: swaps with the adjacent sibling; moving the first up and the last down are no-ops returning the input unchanged; an unknown id is a no-op; a child moves only among its siblings and never past its parent's boundary; moving a parent does not reorder any children relative to that parent
- [ ] T013 [US1] Implement `moveProcessInOrder` in `lib/domain/process-order.ts`, making T012 pass
- [ ] T014 [US1] Write failing integration tests for `reorderProcesses` in `tests/integration/process-reorder.test.ts`: rejects a caller without `EDITOR`; rejects an id belonging to another workspace; rejects a set that is not exactly that level's processes; writes `0..n-1` on success
- [ ] T015 [US1] Implement `reorderProcesses` in `lib/actions/process.ts` per `contracts/process-ordering.md` — Zod schema, `requireWorkspaceAccess(..., "EDITOR")`, permutation check, single transaction, revalidate the Processes page and export picker — making T014 pass
- [ ] T016 [US1] Order the query results through `orderProcessesForDisplay` in `app/(app)/workspaces/[workspaceId]/processes/page.tsx`, replacing the `orderBy: { code: "asc" }` grouping that page builds today
- [ ] T017 [US1] Add move-up/move-down controls per row in `app/(app)/workspaces/[workspaceId]/processes/process-forms.tsx`, calling `reorderProcesses`; each control carries an accessible name identifying the process it moves, and controls are disabled at the ends of a sibling group rather than erroring (FR-011)
- [ ] T018 [US1] Hide the controls from users without edit rights in `app/(app)/workspaces/[workspaceId]/processes/page.tsx`, with the server action remaining the actual gate (FR-012)
- [ ] T019 [US1] Add an e2e test to `tests/e2e/core-workflows.spec.ts` covering the story: reorder by keyboard alone, reload and confirm persistence, move a parent and confirm its sub-process follows and stays indented, confirm a first-row move-up is a silent no-op
- [ ] T020 [US1] Run `pnpm run lint`, `pnpm run build`, `pnpm exec vitest run` and the new e2e test; confirm the seeded workspace still opens in its pre-migration order

**Checkpoint**: US1 is independently shippable. The library can be arranged; nothing else has changed.

---

## Phase 4: User Story 2 — The arranged order reaches the pack (P2)

**Goal**: The picker, the report and the PowerPoint deck all follow the library order, with no
manual step between them.

**Independent Test**: With an arranged workspace, confirm the picker matches the Processes page,
then confirm the report's index, its per-process sections, and the PPTX slides all follow it.

- [ ] T021 [P] [US2] Write failing unit tests for `applyPackOrder` in `tests/unit/process-order.test.ts`: reorders to the given sequence; ids not named keep their relative order and follow the named ones; unknown ids in the sequence are ignored rather than throwing; an empty sequence leaves the input order untouched
- [ ] T022 [US2] Implement the generic `applyPackOrder` in `lib/domain/process-order.ts` per `contracts/process-ordering.md`, making T021 pass
- [ ] T023 [US2] Order the picker's list through `orderProcessesForDisplay` in `app/(app)/workspaces/[workspaceId]/export/page.tsx`, replacing `orderBy: { code: "asc" }`, so the checkboxes are rendered — and therefore submitted — in library order
- [ ] T024 [US2] Apply the incoming `processIds` sequence to the loaded processes with `applyPackOrder` in `lib/reports/load-report-data.ts`, replacing the `orderBy: { code: "asc" }` that currently discards it; apply it as a sort, never a filter, so a stale or partial sequence still renders (contracts §3)
- [ ] T025 [US2] Verify no further change is needed in `app/reports/[workspaceId]/export-preview.tsx` or `lib/export/pptx/report-pptx.ts` — both consume `ReportData.processes` in array order, so both inherit the sequence; if either re-sorts, remove that sort
- [ ] T026 [US2] Add an e2e test in `tests/e2e/report-order.spec.ts` (new file) that arranges a workspace, then asserts the picker order, the report's "Processes in This Report" index order, and the order of the per-process sections all match
- [ ] T027 [US2] Extend `tests/e2e/export.spec.ts` to assert the downloaded PPTX's per-process slides follow the same order as the report, so the two exports cannot drift (FR-009)

**Checkpoint**: US1 + US2 shippable together. One order, four surfaces.

---

## Phase 5: User Story 3 — Order one pack without disturbing the library (P3)

**Goal**: A pack can be arranged for its audience; the library and every other pack are
unaffected, and the arrangement travels with the report link.

**Independent Test**: Reorder on the export side, generate the report, confirm it follows the
pack order — then confirm the Processes page is unchanged and a fresh export starts in library
order.

- [ ] T028 [US3] Make the picker's process list client-reorderable in `app/(app)/workspaces/[workspaceId]/export/page.tsx` (extracting a client component alongside it if the page must stay a Server Component), with move-up/move-down controls that reorder the rows in the DOM so the native `GET` form submits `ids` in the arranged sequence (research R3)
- [ ] T029 [US3] Confirm the picker's reordering writes nothing: no server action call, no mutation of `Process.order` — the arrangement exists only in the submitted query string (FR-014)
- [ ] T030 [US3] Make the picker's controls keyboard-operable with accessible names, matching T017's treatment, and ensure reordering a row does not change which rows are checked
- [ ] T031 [US3] Add e2e coverage to `tests/e2e/report-order.spec.ts`: arrange a pack differently from the library, assert the report follows the pack order, re-open the report URL in a fresh page and assert the order is reproduced, then assert the Processes page order is unchanged and a fresh export begins in library order

**Checkpoint**: all three stories delivered.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T032 [P] Walk the robustness table in `quickstart.md` against a running app: a removed `ids`, a foreign-workspace `ids`, a deleted-process `ids`, and a reversed sequence must each render rather than error
- [ ] T033 [P] Run the accessibility e2e suite (`tests/e2e/accessibility.spec.ts`) against the Processes page and export picker with the new controls present, confirming no new violations
- [ ] T034 Run the full suite — `pnpm run lint`, `pnpm run build`, `pnpm exec vitest run`, `pnpm exec playwright test` — and confirm every count is at or above the baseline recorded in T001
- [ ] T035 Update `specs/003-process-ordering/tasks.md` marking tasks complete, then commit and push to `claude/process-mapping-raci-tool-v1i9lb`
- [ ] T036 Deploy, purge the CDN cache, and verify the deployed build is actually serving the change rather than trusting the deploy status — a cached page has masked a live fix in this app before

---

## Dependencies & Execution Order

```text
Phase 1 Setup
     ↓
Phase 2 Foundational   ← blocks everything
     ↓
Phase 3 US1 (P1)  ── independently shippable ── MVP
     ↓
Phase 4 US2 (P2)  ── needs US1's stored order to have something to carry
     ↓
Phase 5 US3 (P3)  ── needs US2's link-order handling to have an effect
     ↓
Phase 6 Polish
```

**Story dependencies are real here, not incidental**: US2 carries the order US1 stores, and US3
overrides the order US2 taught the report to respect. Each is still independently *testable* and
*shippable* — stopping after US1 leaves a working arranged library; stopping after US2 leaves
packs that follow it.

## Parallel Opportunities

- **T005 with T003/T004**: `nextOrderForLevel` tests are a separate concern from the display
  comparator, though both land in the same two files — coordinate the edits.
- **T011 with T012**: different test files (`integration/` vs `unit/`).
- **T021 with T012/T013**: `applyPackOrder` shares no code with `moveProcessInOrder`.
- **T032 with T033**: different surfaces, both read-only checks.

Most of this feature is a short dependency chain rather than a wide fan-out — the column has to
exist before anything reads it, and each story builds on the last. Parallelism is not where the
time goes.

## Implementation Strategy

**MVP is Phase 1 → 3 (US1).** A consultant who can arrange the library has the thing that was
actually asked for; the export inheriting it is the obvious next increment rather than a
precondition.

**Stop-and-ship points**: after T020 (library arranged), after T027 (order reaches every export),
after T031 (per-pack ordering). Each leaves the app coherent.

**Riskiest task**: T008, the backfill migration. It runs against real client data and a wrong
backfill silently reorders every workspace on deploy. T009 exists to check that specific
outcome before anything else is built on it.
