# Tasks: Step Join Requirement

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Tests are included. `reconcilePredecessorDrafts` (research.md Decision 4) and the
printed-map either/all-by-name wording split (research.md Decision 5) are both business
logic under Constitution Principle III: tests first, then implementation, mutation-checked.
Everything else is UI composition and schema plumbing over already-tested, already-gated
server actions.

## Phase 1: Foundational — the migration and the reconciliation function (blocks every slice)

- [X] T001 Add `joinRequiresAll Boolean @default(false)` to `ProcessStep` in
      `prisma/schema.prisma` (data-model.md), then run
      `CI=true pnpm exec prisma migrate dev --name step_join_requires_all` to generate and
      apply the additive migration.
- [X] T002 Write `tests/unit/predecessor-editor.test.ts` against the contract in
      [data-model.md](./data-model.md): `reconcilePredecessorDrafts(existing, staged)` — a
      staged box matching an existing connection's `fromStepId` and label is a no-op; a
      changed label or changed `fromStepId` produces one delete + one create for that
      connection; a box with no matching existing connection produces a create; an existing
      connection with no matching staged box produces a delete; a box with `fromStepId ===
      ""` (unset) produces nothing. Confirm these fail before T003 exists.
- [X] T003 Implement `lib/domain/predecessor-editor.ts`: `reconcilePredecessorDrafts`, plus
      the `ExistingPredecessorConnection`/`PredecessorDraft`/`PredecessorOperation` types from
      data-model.md. Pure — no DOM, no Prisma, no network.
- [X] T004 Extend the same test file for edge cases: two staged boxes both pointing at the
      same predecessor step (both survive independently, distinct connections); a step with
      three or more staged predecessors reconciles the same way as two (spec Edge Cases —
      "not limited to pairs"); staged/existing order does not affect the result.
- [X] T005 Make T002/T004 pass, then mutation-check: swap the create/delete branches, drop the
      label-change detection, drop the unset-box skip — confirm each is caught by the tests,
      then restore.

**Checkpoint**: the reconciliation logic this feature's UI depends on is correct and proven
without rendering anything, and the schema change existing processes rely on defaulting to
`false` is in place.

## Phase 2: User Story 1 — every predecessor is visible and manageable from the step's own editor (Priority: P1) 🎯 MVP part 1

**Goal**: A step's editor shows every incoming connection, not just one, and each can be
added or removed independently.

**Independent Test**: Open the editor for a step with two connections already leading into
it (created some other way, e.g. two separate "Connects from" edits on two different
steps), confirm both are listed, add a third, remove one, and confirm the step itself and
its remaining predecessors are unaffected.

- [X] T006 [US1] Build
      `app/(app)/workspaces/[workspaceId]/processes/[processId]/map/predecessor-editor.tsx`:
      renders one box per `PredecessorDraft`, each with a destination `<select>` offering
      every other step in the process (reusing the `stepOptions` list `step-list-row.tsx`
      already computes, the same list `DecisionBranchEditor` uses — including steps that come
      later, permitting a loop-back per FR-002) and an editable connector-label `<input>`, a
      remove control per box, and a "+ Add predecessor" control that appends an empty box.
      Takes the current `PredecessorDraft[]` and an `onChange` callback — no server calls of
      its own, mirroring `decision-branch-editor.tsx`'s shape.
- [X] T007 [US1] Wire `step-list-row.tsx`: replace the existing single "Connects from" /
      "Connector label" field pair in edit mode with `predecessor-editor.tsx` (data-model.md —
      full replacement, not additive, since FR-001 is exactly "not only one"), seeded via a
      new `seedPredecessorDrafts(existing)` helper (alongside `predecessor-editor.tsx`,
      mirroring `seedBranchDrafts`) from the step's own incoming connections. On Save, after
      `updateProcessStep` succeeds, call `reconcilePredecessorDrafts` (T003) against the row's
      current incoming connections and the staged drafts, then apply the resulting creates
      (`createStepConnection`, `toStepId` = this step) and deletes (`deleteStepConnection`).
- [X] T008 [US1] Extend
      `app/(app)/workspaces/[workspaceId]/processes/[processId]/map/map-view.tsx`: replace
      `incomingConnectionOf` (one per step) with `incomingConnectionsOf` (a
      `Map<stepId, ConnectionT[]>`, mirroring the existing `outgoingConnectionsOf`), and pass
      each row its own full list of incoming connections instead of a single one.
- [X] T009 [US1] Update the closed row's summary line in `step-list-row.tsx` (currently
      `Connects from: ${predecessor.label}…` / `"Entry point — no predecessor"`) to name every
      predecessor when there's more than one (e.g. "Connects from: A and B"), still reading
      exactly as today when there's exactly one or zero.
- [X] T010 [US1] Write `tests/e2e/step-join-requirement.spec.ts` covering User Story 1's
      Acceptance Scenarios: a step with two pre-existing incoming connections shows both in
      its editor; adding a predecessor creates a real connection visible after reopening the
      editor; removing one predecessor deletes only that connection, leaving the step and its
      other predecessor unaffected.

**Checkpoint**: the concrete gap found while scoping this ("predecessor is singular
everywhere") is closed — a step can have, and show, more than one predecessor. Shippable on
its own, though not yet expressive about *how* they combine.

## Phase 3: User Story 2 — marking a step as needing every predecessor (Priority: P1) 🎯 MVP part 2

**Goal**: A step with two or more predecessors can be set to require all of them, defaulting
to (and reversible back to) "either is enough."

**Independent Test**: Give a step two predecessors, leave the rule at its default, confirm
it reads as an ordinary convergence; switch to "requires all," confirm it reads as waiting on
both; switch back, confirm it reads exactly as before.

- [X] T011 [US2] Add `joinRequiresAll: z.boolean().optional()` to `updateStepSchema` in
      `lib/actions/process.ts`, and write it in `updateProcessStep`'s `prisma.processStep.update`
      call guarded the same way `detailedAction`/`exceptionHandling` already are (`undefined`
      leaves the existing value untouched).
- [X] T012 [US2] Add a "Requires all predecessors" checkbox to `step-list-row.tsx`'s edit
      mode, next to `predecessor-editor.tsx` (T006), bound to a new `joinRequiresAll` state
      initialized from `step.joinRequiresAll` and included in the `updateProcessStep` call on
      Save. Not disabled when fewer than two predecessors are staged (Edge Cases — the rule
      can be set ahead of a second predecessor being added).
- [X] T013 [US2] Extend the closed row's summary line (T009) so that when `step.joinRequiresAll`
      is true and there are two or more predecessors, it reads as needing all of them by name
      (e.g. "Needs both A and B" / "Needs all of A, B, and C") instead of "Connects from: …".
      With fewer than two predecessors, or the rule off, the line reads exactly as T009 left
      it (Edge Cases — the rule has no visible effect until there are two or more).
- [X] T014 [US1+US2] Extend `tests/e2e/step-join-requirement.spec.ts`: setting the rule to
      "requires all" on a two-predecessor step changes its summary line; leaving it at the
      default reads identically to an unmarked convergence; toggling it off after turning it
      on restores the original reading exactly (SC-004); a step's rule survives an unrelated
      edit (renaming the step, changing its role) untouched (Edge Cases).

**Checkpoint**: the reported gap itself — "2 separate steps... needed (both) to start
another step" — is now expressible and visible on the Steps List. This is the feature's MVP;
Phase 2 + Phase 3 together are what the user scoped as "join only" when deferring 7a/7b
numbering.

## Phase 4: User Story 3 — the distinction reads correctly on the printed report (Priority: P2)

**Goal**: The printed report (Flow and Roles layouts) describes a "requires all" convergence
by naming its predecessors, and leaves every other convergence reading exactly as it does
today.

**Independent Test**: Set one step's rule to "requires all" and leave another's at default,
in the same process; confirm the printed report describes the two differently, and only the
"requires all" step's own wording changed.

- [X] T015 [US3] Add `joinRequiresAll: boolean` to `PrintStepInput` in
      `lib/domain/print-map-layout.ts`; change `FlowRow.mergesFrom` and `RolesCell.mergesFrom`
      from `number[]` to `{ order: number; label: string }[]`, built from `byId.get(...)!`
      (already available at both call sites — `.order` and `.label` both already on
      `PrintStepInput`). No behavior change yet — the numeric wording in the renderers still
      reads `.order` off the new shape.
- [X] T016 [US3] Update `tests/unit/print-map-layout.test.ts` for the `mergesFrom` shape
      change (existing merge test now asserts `{ order, label }` objects), and add a new case:
      a step with `joinRequiresAll: true` and two incoming connections produces `mergesFrom`
      entries carrying both predecessors' real labels.
- [X] T017 [US3] Update `flow-layout.tsx` and `roles-layout.tsx`: when
      `row.step.joinRequiresAll` / `cell.step.joinRequiresAll` is true and `mergesFrom.length >
      1`, render a by-name wording (e.g. "needs both X and Y" for two, "needs all of X, Y, and
      Z" for three or more) instead of the existing `joins step ${n} and step ${n}` line; when
      false (or `mergesFrom.length <= 1`), keep the exact existing numeric wording unchanged
      (FR-007).
- [X] T018 [US3] Extend `tests/e2e/printed-map.spec.ts`: a step with `joinRequiresAll` set and
      two named predecessors prints the by-name wording on the Flow layout; an unmarked merge
      elsewhere in the same report still prints "joins step X and step Y"; repeat for the
      Roles layout.

**Checkpoint**: all three user stories are independently functional — a reader of any
surface (Steps List, printed Flow, printed Roles) can tell the two kinds of convergence
apart, by name, with zero change to any process that hasn't used the new rule.

## Phase 5: Polish

- [X] T019 Run `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm exec playwright test`
      and report counts. Do not edit while a run is in flight.
- [X] T020 Blast-radius check: `process-map-canvas.tsx` and `step-form.tsx` must be unchanged
      by this feature (research.md Decision 5 / data-model.md) — confirm via `git diff`
      against those paths showing nothing from this feature's commits.
- [X] T021 Run [quickstart.md](./quickstart.md)'s manual validation end to end (all three
      scenarios) and record the result.

## Dependencies

- Phase 1 blocks Phase 2, 3, and 4: all three wire UI or renderers to `reconcilePredecessorDrafts`
  or to the now-migrated `joinRequiresAll` column.
- Phase 2 (US1) blocks Phase 3 (US2) in practice: the "requires all" checkbox and its summary
  wording (T012/T013) are only meaningful once a step can show more than one predecessor
  (T006–T009) — built in sequence here, though each phase's own Independent Test still holds
  in isolation.
- Phase 4 (US3) depends on Phase 3 (US2): the printed report's by-name wording reads
  `step.joinRequiresAll`, which T011 introduces.
- Phase 2 + Phase 3 together are the MVP (matches the user's own "join only, first" scope
  decision — this is the reported gap, closed). Phase 4 is a clean follow-on slice with no
  rework of Phases 2–3.

## Implementation Strategy

**MVP first**: Phase 1 → Phase 2 → Phase 3 → stop and validate against quickstart.md
Scenarios 1–2. That alone closes the reported gap ("2 separate steps... needed (both) to
start another step"). Phase 4 (printed-report wording) is a clean follow-on with no rework of
Phases 2–3, closing User Story 3 for full spec compliance.
