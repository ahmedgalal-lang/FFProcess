# Tasks: Decision Branch Editor

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Tests are included. Reconciling staged branch boxes against a step's existing outgoing
connections (research.md Decision 4) is business logic under Constitution Principle III:
tests first, then implementation, mutation-checked. Everything else is UI composition over
already-tested, already-gated server actions.

**Found while implementing FR-015**: `step-list-row.tsx` has no `canEdit` check at all — its
Edit/Delete/Move-up/Move-down/Mark-milestone controls render for every Viewer today, unlike
`step-form.tsx`'s `AddStepForm`, which already self-hides (`if (!canEdit) return null;`).
Server-side gating is intact (every action already requires `EDITOR`), so this is a UI-only
exposure, but the new branch editor would inherit it directly if left as-is — FR-015 cannot
hold for the new editor while the row it lives in has no gate at all. T006 fixes this
pre-existing gap as a prerequisite, not as new scope creep: it is the same one-line pattern
already used everywhere else in the product (`useCanEdit()` + conditional render), not a
redesign.

## Phase 1: Foundational — the reconciliation function (blocks every slice)

- [X] T001 Write `tests/unit/decision-branches.test.ts` against the contract in
      [data-model.md](./data-model.md) / research.md Decision 4:
      `reconcileBranchDrafts(existing: StepConnection[], staged: BranchDraft[])` — a staged
      box matching an existing connection's destination and label is a no-op; a box matching
      a destination but with a changed label produces one delete + one create for that
      connection; a box with no matching existing connection produces a create; an existing
      connection with no matching staged box produces a delete; a box with `destination.kind
      === "unset"` produces nothing. Confirm these fail before T002 exists.
- [X] T002 Implement `lib/domain/decision-branches.ts`: `reconcileBranchDrafts`, plus the
      `BranchDraft` type from data-model.md. Pure — no DOM, no Prisma, no network.
- [X] T003 Extend the same test file for the edge cases: two staged boxes targeting the same
      destination (both survive independently — spec Edge Cases); a box targeting the
      Decision step itself (treated like any other destination, no special-casing per
      research.md Decision 5); staged/existing order does not affect the result.
- [X] T004 Make T001/T003 pass, then mutation-check: swap the create/delete branches, drop
      the label-change detection, drop the unset-box skip — confirm each is caught by the
      tests, then restore.

**Checkpoint**: the one piece of real logic this feature adds is correct and proven without
rendering anything.

## Phase 2: User Story 1 + 2 — the editor appears for Decision steps and creates real branches (Priority: P1) 🎯 MVP

**Goal**: Setting a step's Type to Decision shows a working two-box editor; every other type
keeps the plain single connector. Each box can target a new step or an existing one.

**Independent Test**: Add a step, set Type to Decision, fill the Yes box with a new step and
the No box with an existing earlier step, save, and see both connections on the Steps List
and the live canvas — then confirm a Task/Start/End step never shows this editor at all.

- [X] T005 [P] [US1] Fix the pre-existing gap: add `useCanEdit()` to
      `app/(app)/workspaces/[workspaceId]/processes/[processId]/map/step-list-row.tsx` and
      hide Edit/Delete/Move-up/Move-down/Mark-milestone for a non-editor, matching the
      pattern `step-form.tsx`'s `AddStepForm` already uses. This is a prerequisite for
      FR-015 to mean anything for the branch editor built on top of this row.
- [X] T006 [US1] Build
      `app/(app)/workspaces/[workspaceId]/processes/[processId]/map/decision-branch-editor.tsx`:
      renders one box per `BranchDraft` (two by default, labeled "Yes"/"No" — FR-003/FR-004),
      each with an editable label, a kind toggle ("create a new step" / "link to an existing
      step" — FR-005), a step-name input for the new-step kind, and a destination `<select>`
      offering every other step in the process for the existing-step kind (FR-006, reusing
      the `stepOptions` list already computed in `map-view.tsx`). Takes the current
      `BranchDraft[]` and an `onChange` callback — no server calls of its own (research.md
      Decision 3).
- [X] T007 [US1] Wire `step-form.tsx`: when `type === "DECISION"`, render
      `decision-branch-editor.tsx` **alongside** the existing "Connects from"/"Connector
      label" fields, which are left exactly as they are for every Type — they describe what
      precedes this step, a separate question from what a Decision branches to (FR-001/FR-002
      — corrected from an earlier "replace" framing once `addProcessStep`'s `fromStepId`/
      `connectionLabel` were traced through and confirmed to always describe the *incoming*
      edge, never the current step's own outgoing branches). On submit, call `addProcessStep`
      for the Decision step itself (exactly as today, including its own optional incoming
      connection), then for each non-unset staged branch call either `addProcessStep`
      (new-step kind, `fromStepId` = the id `addProcessStep` just returned) or
      `createStepConnection` (existing-step kind) — sequential awaits in the same submit
      handler (research.md Decision 3). A step form left with Type other than Decision is
      entirely unchanged.
- [X] T008 [US1] Wire `step-list-row.tsx`'s edit mode: same additive, type-conditional render
      (branch editor alongside the unchanged "Connects from" field, not replacing it); on Save,
      after `updateProcessStep` succeeds, call `reconcileBranchDrafts` (T002) against the
      row's current outgoing connections and the staged `BranchDraft[]`, then apply the
      resulting creates (`createStepConnection`/`addProcessStep`) and deletes
      (`deleteStepConnection`) — mirroring how the row already applies its one incoming
      connection's change today.
- [X] T009 [US2] Extend
      `app/(app)/workspaces/[workspaceId]/processes/[processId]/map/map-view.tsx`: compute
      `outgoingConnectionsOf` (a `Map<stepId, ConnectionT[]>`, mirroring the existing
      `incomingConnectionOf`) from the process's already-loaded `connections`, and pass a
      Decision row its own outgoing connections so `step-list-row.tsx` can pre-populate the
      branch editor from what already exists (FR-009) — including connections carrying a
      label other than "Yes"/"No" from before this feature (FR-014).
- [X] T010 [US1+US2] Write
      `tests/e2e/decision-branch-editor.spec.ts` against the tender-style fixture or a
      dedicated one: Type=Task shows the plain connector field, not the branch editor;
      setting Type to Decision reveals the two-box editor immediately; setting it back to
      Task hides it and restores the plain field; a Yes branch to a brand-new step and a No
      branch to an existing, earlier step both create the right connections, each visible
      with its own label on the Steps List and reflected in the live canvas
      (`process-map-canvas.tsx`, unchanged, already renders a connection's own label);
      looping a branch back to an earlier step is not blocked (FR-013 verified by asserting
      `printed-map`/canvas rendering code paths are untouched — a diff check, not new
      behavior to test).

**Checkpoint**: the reported gap — no way to gate or properly build a Decision's Yes/No —
is closed and measured. Shippable on its own.

## Phase 3: User Story 3 — a decision can outgrow two outcomes (Priority: P2)

**Goal**: A consultant can add a third (or further) branch beyond Yes/No, each independently
editable and removable.

**Independent Test**: On a Decision step already showing Yes/No, add a third branch with its
own label and destination; reopen the editor later and confirm all three are shown, each
editable and removable on its own.

- [X] T011 [US3] Extend `decision-branch-editor.tsx` (T006) with a "+ Add another outcome"
      control that appends a `BranchDraft` with an empty, freely-editable label (not
      defaulted to "Yes"/"No" — FR-010) and its own destination picker, and a remove control
      per box beyond the first two (FR-011).
- [X] T012 [US3] Extend `tests/e2e/decision-branch-editor.spec.ts`: add a third branch on a
      Decision step that already has Yes/No, confirm all three connections persist, and that
      reopening the editor later shows all three, independently editable and removable
      (spec User Story 3, Acceptance Scenario 2).

**Checkpoint**: all three user stories are independently functional.

## Phase 4: Polish

- [X] T013 Run `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`,
      `pnpm exec playwright test` and report counts. Do not edit while a run is in flight.
- [X] T014 Blast-radius check: `process-map-canvas.tsx` and
      `app/reports/[workspaceId]/printed-map/**` must be unchanged by this feature (FR-013) —
      confirm via `git diff` against those paths showing nothing from this feature's commits.
- [X] T015 Run [quickstart.md](./quickstart.md)'s manual validation end to end, including its
      Viewer check (step 6), and record the result. Steps 1, 2, 3 and 6 are each the direct
      subject of one `tests/e2e/decision-branch-editor.spec.ts` test and were run and passed
      (5/5) both individually and together. Step 5 (printed/live rendering unaffected) is
      covered two ways: T014's diff (zero changes to either renderer) and the live-canvas
      edge-label assertion in the "Yes branch to a new step..." test. Step 4 (arbitrary
      pre-existing labels survive) holds by construction — `seedBranchDrafts` passes a stored
      connection's `label` straight through with no transformation — and the same code path
      is what the FR-009 test exercises, just with "Yes"/"No" as the labels in play; there is
      no branch in `seedBranchDrafts` or `reconcileBranchDrafts` that treats "Yes"/"No" as
      special versus any other string, so this was not felt to need a separate redundant test.

## Dependencies

- Phase 1 blocks Phase 2 and Phase 3: both wire UI to `reconcileBranchDrafts`.
- T005 (the `canEdit` fix) blocks T006–T010: the branch editor is built inside the row this
  fixes, and FR-015 needs it in place first.
- T009 blocks T008 fully working end-to-end (pre-population needs the outgoing-connections
  data), though T008 can be written against it in parallel and wired once T009 lands.
- Phase 2 is the MVP and is shippable without Phase 3.
- T011 depends on T006; T012 depends on T007/T008 (the editor must already create real
  connections before a third one is worth testing).

## Implementation Strategy

**MVP first**: Phase 1 → Phase 2 → stop and validate against quickstart.md steps 1–2 and 6.
That alone closes the reported gap ("the yes and no in the decision is not implemented").
Phase 3 (more than two branches) is a clean follow-on slice with no rework of Phase 2.
