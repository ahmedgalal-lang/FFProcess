# Quickstart: Step Join Requirement

## Prerequisites

- Dev server running (`pnpm dev`), Postgres up, signed in as an EDITOR on
  workspace `workspace-acme` (or any seeded workspace with a process that has
  at least three steps).

## Scenario 1 — see and manage every predecessor (User Story 1)

1. Open a process's Steps List (`/workspaces/<id>/processes/<id>/map`, "Steps
   List" toggle).
2. Pick a step with only one predecessor today. Open its editor (pencil
   icon).
3. Confirm the predecessor editor shows exactly one box, matching the
   existing "Connects from" value.
4. Click "Add predecessor," choose a different earlier step, save.
5. Reopen the editor: two predecessor boxes are listed. Remove one, save,
   reopen: the step is back to one predecessor, and the step you didn't touch
   is unaffected (check its own row is unchanged).

**Expected**: `StepConnection` rows created/deleted match 1:1 with what was
staged; no other step's connections change.

## Scenario 2 — mark "requires all" and confirm it's a no-op by default (User Story 2)

1. On a step with two predecessors (from Scenario 1), leave "Requires all
   predecessors" unchecked. Save. Confirm the row's summary line still reads
   as an ordinary convergence ("Connects from: A and B" or equivalent) — same
   as it read before this feature existed.
2. Check "Requires all predecessors," save. Confirm the summary line now
   reads as needing both, by name.
3. Uncheck it again, save. Confirm the row reverts exactly to how it read in
   step 1 — nothing left over (SC-004).

## Scenario 3 — the distinction reaches the printed report (User Story 3)

1. In the same process, generate the printed map (Flow layout — a process
   with ≤ `MAX_ROLE_COLUMNS` roles, or force Roles by using a process within
   that limit).
2. Locate the step from Scenario 2. With the rule off: confirm it still
   reads "joins step X and step Y" (unchanged, numeric).
3. Turn the rule on, regenerate: confirm the same step now reads a
   needs-both/all wording naming the actual predecessor labels, not numbers.
4. Confirm every *other* merge on the same report — any step still at the
   default rule — is unchanged in wording (SC-002: only the one step you
   touched changed).
5. Repeat with the Roles layout if the process qualifies for it.

## Automated verification

- `pnpm vitest run tests/unit/predecessor-editor.test.ts` — diff logic
  (`reconcilePredecessorDrafts`), mirroring
  `tests/unit/decision-branches.test.ts`'s coverage shape.
- `pnpm vitest run tests/unit/print-map-layout.test.ts` — `mergesFrom` now
  carries labels; a new case covers the `joinRequiresAll` wording split.
- `pnpm vitest run tests/integration/process.test.ts` (or wherever
  `updateProcessStep` is covered) — `joinRequiresAll` persists, and omitting
  it from a request leaves the existing value untouched.
- `pnpm exec playwright test tests/e2e/step-join-requirement.spec.ts` — the
  three scenarios above, end-to-end, mirroring
  `tests/e2e/decision-branch-editor.spec.ts`'s structure.
