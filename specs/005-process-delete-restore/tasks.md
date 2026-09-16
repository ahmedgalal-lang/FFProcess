---

description: "Task list for Delete Warning & Process Restore"
---

# Tasks: Delete Warning & Process Restore

**Input**: Design documents from `specs/005-process-delete-restore/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/server-actions.md

**Tests**: Included. Principle III of the constitution requires business-rule logic to have
tests written first that fail before the implementation makes them pass. The rules here are
what a restore leaves untouched, what the impact counts include, and who may restore.

**Organization**: Grouped by user story. US1 (restore) ships first because the warning in
US2 promises recovery, and that promise has to be true before it is printed.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to

---

## Phase 1: Setup

No setup. This feature adds no dependency, no migration and no configuration — it builds on
`Process.archivedAt`, which already exists and is already written by `archiveProcess`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared pieces both stories need. Nothing in Phase 3 or 4 can start until
these land.

- [X] T001 Create `lib/domain/process-delete-impact.ts` exporting the `ProcessDeleteImpact` type and a pure `summariseDeleteImpact(counts)` that derives the `isEmpty` case (steps, RACI assignments, authority rules and KPIs all zero) and the sentence fragments the dialog prints, per `specs/005-process-delete-restore/data-model.md`
- [X] T002 Write failing unit tests in `tests/unit/process-delete-impact.test.ts` covering: an empty process reports `isEmpty`; a process with only KPIs is not empty; a process with zero sub-processes produces no orphan warning; counts of already-deleted sub-processes are excluded from the orphan warning. Confirm they fail against T001's stub before implementing
- [X] T003 Implement `summariseDeleteImpact` in `lib/domain/process-delete-impact.ts` until T002 passes

**Checkpoint**: the counting rules are settled and tested without a database.

---

## Phase 3: User Story 1 — Put back a process deleted by mistake (Priority: P1) 🎯 MVP

**Goal**: A consultant can see what a workspace has deleted and restore it, complete and
unchanged, without leaving the application.

**Independent test**: Delete a populated process, confirm it has left every list and the
export report, restore it from the deleted page, confirm it reappears with identical
content.

### Tests for User Story 1

- [X] T004 [P] [US1] Write failing e2e spec `tests/e2e/process-restore.spec.ts`: as an editor, record a process's step count, one RACI letter and one authority sentence; delete it; assert it is absent from the Processes list and the Export Report picker; restore it from the deleted page; assert the three recorded facts are unchanged. Confirm it fails before T006–T009 land
- [X] T005 [P] [US1] Extend `tests/e2e/viewer-read-only.spec.ts`: a viewer sees no "Deleted processes" link on the Processes page, and navigating directly to `/workspaces/<id>/processes/deleted` does not show the list or any Restore control

### Implementation for User Story 1

- [X] T006 [US1] Add `restoreProcess` to `lib/actions/process.ts` beside `archiveProcess`: Zod-validated input, `requireWorkspaceAccess(workspaceId, "EDITOR")`, `loadProcessInWorkspace` (which already ignores `archivedAt`), set `archivedAt` to null, revalidate both paths. Idempotent — an already-live process returns `ok`. Per `contracts/server-actions.md`
- [X] T007 [US1] Create `app/(app)/workspaces/[workspaceId]/processes/deleted/page.tsx`: a Server Component listing the workspace's deleted processes as `DeletedProcessRow` (code, name, deleted date, step count, parent code), ordered most recently deleted first, gated at page level on edit access, with a real empty state saying nothing has been deleted
- [X] T008 [US1] Create `app/(app)/workspaces/[workspaceId]/processes/deleted/restore-button.tsx`: a Client Component calling `restoreProcess` then `router.refresh()`, returning `null` when `useCanEdit()` is false, with a visible focus ring and a disabled state while pending
- [X] T009 [US1] Add an editor-only link to the deleted page from `app/(app)/workspaces/[workspaceId]/processes/page.tsx`, carrying the count when one or more processes are deleted and rendering nothing for a viewer

**Checkpoint**: recovery works end to end and is the answer the US2 warning can point at.

---

## Phase 4: User Story 2 — See what a delete takes with it (Priority: P2)

**Goal**: Before confirming, a consultant is told which process is going, what is attached
to it, and that it can be undone.

**Independent test**: Trigger Delete on a process with known contents and read the
confirmation; it names the process and describes its contents accurately, with nothing
deleted yet.

### Tests for User Story 2

- [X] T010 [P] [US2] Extend `tests/e2e/process-restore.spec.ts` (or add `tests/e2e/delete-warning.spec.ts`): the confirmation names the process by code and name, states its step count, says it holds RACI assignments and authority rules, says the deletion can be undone, and declining leaves the process present
- [X] T011 [P] [US2] Add an axe check for the open confirmation dialog in `tests/e2e/accessibility.spec.ts`, matching how the existing surfaces are checked there

### Implementation for User Story 2

- [X] T012 [US2] Add `getProcessDeleteImpact` to `lib/actions/process.ts`: Zod-validated input, `EDITOR` access (the same bar as the delete it precedes), gather the six counts from `data-model.md` — sub-process and branching counts filtered to live processes only — and return `summariseDeleteImpact(...)`
- [X] T013 [US2] Rewrite `ArchiveProcessButton` in `app/(app)/workspaces/[workspaceId]/processes/process-forms.tsx` as a dialog matching the Clone/Edit pattern in the same file (`role="dialog"`, `aria-modal`, `aria-label`, backdrop dismiss), fetching the impact on open and showing a loading state until it arrives
- [X] T014 [US2] Write the confirmation copy: names the process as `CODE · Name`; lists what it carries, or says the process is empty when `isEmpty`; states the deletion can be undone and names the deleted processes page. Keep the action word "delete" per the spec's Assumptions
- [X] T015 [US2] Add Escape-to-dismiss and focus-on-open to the new dialog, and a visible focus ring on both buttons (Principle IV). Leave the existing Clone and Edit dialogs alone — the retrofit is recorded in plan.md as a separate change

**Checkpoint**: the warning is informative and its promise of recovery is true.

---

## Phase 5: User Story 3 — Nested and branching processes stay coherent (Priority: P3)

**Goal**: The consultant is warned when other processes point at the one they are deleting,
and restoring puts the relationship back.

**Independent test**: Delete a process with two sub-processes and one process branching
from its steps; the warning names all three, the three survive, and restoring the parent
re-nests them.

### Tests for User Story 3

- [X] T016 [P] [US3] Extend the delete-warning e2e spec: deleting a process with sub-processes warns how many will be left without their parent, and deleting a process another branches from warns that it will lose its stated starting point
- [X] T017 [P] [US3] Extend `tests/e2e/process-restore.spec.ts`: after deleting a parent, its sub-processes are still listed and reachable; after restoring the parent, they appear nested beneath it again; and a sub-process whose parent is still deleted can itself be restored and stays reachable

### Implementation for User Story 3

- [X] T018 [US3] Add the sub-process and branching sentences to the confirmation copy in `process-forms.tsx`, printing each only when its count is above zero
- [X] T019 [US3] Verify the existing `orphanChildren` handling in `app/(app)/workspaces/[workspaceId]/processes/page.tsx` still lists children of a deleted parent, and show the parent's absence in the row rather than leaving a blank parent column

**Checkpoint**: nesting and branching behave predictably in both directions.

---

## Phase 6: Polish & Cross-Cutting

- [X] T020 [P] Run `pnpm test` and the full Playwright suite; confirm no existing spec regressed, particularly `export.spec.ts` and `report-order.spec.ts`, which depend on deleted processes staying excluded (FR-012)
- [X] T021 [P] Check colour contrast on the new warning text and the deleted-list metadata against WCAG 2.1 AA — `text-slate-400` fails on white and has caused two regressions in this codebase already; use `slate-500` or darker
- [X] T022 Walk `specs/005-process-delete-restore/quickstart.md` by hand end to end, including the keyboard check, and correct the quickstart wherever the built behaviour differs from what it describes

---

## Dependencies

```text
Phase 2 (T001–T003)  ──►  Phase 3 (US1, T004–T009)  ──►  Phase 4 (US2, T010–T015)  ──►  Phase 5 (US3, T016–T019)
                                                                                              │
                                                                            Phase 6 (T020–T022) ◄┘
```

- **US2 depends on US1** for more than convenience: T014's copy states the deletion can be
  undone from the deleted processes page, which must exist first.
- **US3 depends on US2** because its warnings are extra sentences in the dialog US2 builds.
- **T003 blocks everything** — the dialog and its tests both consume `summariseDeleteImpact`.

## Parallel opportunities

- T004 and T005 are different spec files with no shared state.
- T010 and T011 touch different spec files.
- T016 and T017 are separate scenarios and can be written together.
- T020 and T021 are independent checks over finished work.

Within a phase, the implementation tasks are mostly sequential because T006–T009 and
T012–T015 each touch a small number of shared files.

## Implementation strategy

**MVP is Phase 2 + Phase 3.** That alone answers the question that started this — a deleted
process can be recovered from inside the application, without database access. It is
shippable and demonstrable on its own.

**Phase 4 is the second increment**, and is what the user actually asked for in words; it
is second only because its copy would be a lie without Phase 3.

**Phase 5 is the smallest increment** and can be dropped from a first release without
leaving anything broken — sub-processes already survive a parent's deletion today.
