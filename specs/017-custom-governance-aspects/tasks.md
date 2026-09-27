# Tasks: Custom Governance Aspects

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Tests are included. `deleteGovernanceAspect`'s policy/risk-survival behavior (research.md
Decision 2) is business logic with a real, non-obvious failure mode — the schema's own
default cascade would silently delete a policy if the detach step were skipped — so it's
tested first, mutation-checked. The migration's data backfill is verified directly
against seeded rows, not assumed correct. Everything else is CRUD following this file's
own existing, already-tested pattern (ownership-checked id lookups, EDITOR gating).

## Phase 1: Foundational — schema, migration, and the shared aspect names (blocks every slice)

- [X] T001 Add `model GovernanceAspect` to `prisma/schema.prisma` (data-model.md), change
      `GovernanceAssessment.focusArea` to `aspectId String` with the `aspect` relation and
      `@@unique([aspectId])`, replacing `@@unique([workspaceId, focusArea])`.
- [X] T002 Run `CI=true pnpm exec prisma migrate dev --name custom_governance_aspects
      --create-only`, then hand-edit the generated `migration.sql` to add the backfill
      steps from data-model.md's Migration section (seed seven aspects per existing
      workspace, backfill `aspectId` by joining on the old enum value and workspace,
      require it `NOT NULL`, drop the old column and the `GovernanceFocusArea` enum) —
      in that order, before applying.
- [X] T003 Apply the migration (`prisma migrate dev` without `--create-only`, or `prisma
      migrate deploy` in CI). Run `prisma generate`. Confirm against the seeded dev
      database: every existing workspace has exactly seven `governance_aspects` rows
      named exactly as `GOVERNANCE_FOCUS_AREA_LABEL` labelled them, and every existing
      `governance_assessments` row's new `aspectId` resolves to the correct one for its
      workspace (spot-check `workspace-acme`'s Risk & Internal Controls assessment, which
      already has real data from this session's earlier work).
- [X] T004 Add a small shared constant, `DEFAULT_GOVERNANCE_ASPECT_NAMES` (the same seven
      names as the migration's seed list), in `lib/domain/governance-focus-areas.ts` (repurposed
      from its removed static array — see T012) — the one place both the migration's SQL
      and `createWorkspace`'s runtime seeding (T011) read the same seven names from, so
      they cannot drift into two different starting lists.

**Checkpoint**: every existing workspace's aspect list and everything tied to one reads
exactly as before (SC-002), on the new schema.

## Phase 2: User Story 1 — adding an aspect this client actually needs (Priority: P1) 🎯 MVP

**Goal**: A consultant can add a new, per-workspace aspect that is immediately as fully
usable as any built-in one.

**Independent Test**: Add an aspect with a unique name; confirm it's a new tab, empty,
and every governance action (generate, add checklist item/risk/policy by hand) works on
it exactly as it does on a built-in aspect. Adding a duplicate name is rejected.

- [X] T005 [US1] Write `tests/integration/governance.test.ts` tests for a new
      `addGovernanceAspect({ workspaceId, name })` action: creates a row; a duplicate
      name (same workspace) is rejected with a validation error and creates nothing; a
      duplicate name in a *different* workspace succeeds (FR-001); non-EDITOR access is
      rejected. Confirm these fail before T006 exists.
- [X] T006 [US1] Implement `addGovernanceAspect` in `lib/actions/governance.ts`, following
      this file's existing pattern (Zod schema, `requireWorkspaceAccess(..., "EDITOR")`,
      `prisma.governanceAspect.create`, catching the unique-constraint violation into a
      validation error naming the duplicate).
- [X] T007 [US1] Rewire every existing action currently taking `focusArea:
      z.enum(FOCUS_AREAS)` (`generateGovernanceAssessment`, `addGovernanceChecklistItem`)
      to take `aspectId: z.string().min(1)` instead, with an ownership lookup
      (`prisma.governanceAspect.findUnique`, `notFound()` if missing or
      `workspaceId` mismatch) matching every other id-taking action in this file.
      `buildGovernancePrompt`'s `focusAreaLabel` now comes from the looked-up
      `aspect.name`. Update every call site in `tests/integration/governance.test.ts` to
      create a real `GovernanceAspect` first (a small test helper,
      `createGovernanceAspect(workspaceId, name)`, alongside `createFixtureWorkspace`) and
      pass its id instead of a fixed string like `"RISK_CONTROLS"`.
- [X] T008 [US1] Wire `app/(app)/workspaces/[workspaceId]/governance/page.tsx`: query
      `prisma.governanceAspect.findMany({ where: { workspaceId }, orderBy: { createdAt:
      "asc" } })`, pass the list to `GovernanceAssessmentPanel` as `aspects: { id: string;
      name: string }[]`. `focusAreaByAssessmentId`/`assessmentsByFocusArea` (used to label
      a risk/policy's source and to look up which assessment a tab shows) are re-keyed by
      `aspectId`, reading `aspect.name` directly.
- [X] T009 [US1] Wire `governance-assessment-panel.tsx`: remove the `FOCUS_AREAS` import
      and the `focusArea` state's fixed default; take `aspects` as a prop, default the
      active tab to `aspects[0]?.id`, render the tab bar from the prop. Add an "+ Add
      aspect" control (small inline form — a name input and a submit button, matching the
      "+ Add risk"/"+ Add policy" pattern already on this page) that calls
      `addGovernanceAspect` and selects the new tab on success.
- [X] T010 [US1] Write `tests/e2e/governance-aspects.spec.ts` covering User Story 1's
      Acceptance Scenarios: adding a uniquely-named aspect shows a new, empty tab after
      the existing ones; generating an assessment / adding a checklist item, risk, and
      policy by hand all work on it; adding a duplicate name is rejected and the existing
      aspect is untouched.
- [X] T011 [US1] Wire `lib/actions/organization.ts`'s `createWorkspace`: after creating
      the workspace, create the same seven `GovernanceAspect` rows
      (`DEFAULT_GOVERNANCE_ASPECT_NAMES`, T004) so a brand-new workspace opens Governance
      with the same starting tabs an existing one has (FR-011/SC-005) — never an empty
      list.
- [X] T012 [US1] Remove `GOVERNANCE_FOCUS_AREAS` / `GovernanceFocusAreaValue` /
      `GOVERNANCE_FOCUS_AREA_LABEL` from `lib/domain/governance-focus-areas.ts`, leaving
      only `DEFAULT_GOVERNANCE_ASPECT_NAMES` (T004). Fix every remaining import (governance.ts,
      page.tsx, governance-assessment-panel.tsx) — by this task, none should still
      reference the removed exports.

**Checkpoint**: the reported gap — no way to add a client-specific aspect — is closed.
Shippable on its own; renaming and deleting (User Stories 2/3) are additive from here.

## Phase 3: User Story 2 — renaming an aspect (Priority: P2)

**Goal**: A consultant can rename any aspect (built-in or added) without disturbing
anything already tied to it.

**Independent Test**: Rename an aspect with a real assessment/risk/policy on it; confirm
all three are unchanged apart from now reading under the new label. A rename into an
existing name is rejected; the vacated name becomes available.

- [X] T013 [US2] Write `tests/integration/governance.test.ts` tests for a new
      `renameGovernanceAspect({ workspaceId, aspectId, name })` action: renames a plain
      aspect; renaming to a name already used by a *different* aspect in the same
      workspace is rejected and neither name changes; renaming to the exact name a
      *different workspace's* aspect holds succeeds; non-EDITOR access is rejected; a
      mismatched/missing `aspectId` returns not-found. Confirm these fail before T014
      exists.
- [X] T014 [US2] Implement `renameGovernanceAspect` in `lib/actions/governance.ts` —
      ownership check, then `prisma.governanceAspect.update`, same duplicate-name handling
      as `addGovernanceAspect` (T006).
- [X] T015 [US2] Add a rename control to each tab in `governance-assessment-panel.tsx`
      (an inline edit affordance beside the tab, matching the existing per-row "Edit"
      pattern already used for checklist items on this page) that calls
      `renameGovernanceAspect` and updates the tab's label in place.
- [X] T016 [US2] Extend `tests/e2e/governance-aspects.spec.ts`: renaming an aspect that
      already has an assessment, a risk, and a policy leaves all three reachable and
      correct under the new tab label; renaming to a name another aspect holds is
      rejected; renaming a different aspect to the name just vacated then succeeds.

**Checkpoint**: an aspect's name can be corrected to match how a client actually talks
about it, with zero disturbance to what's already recorded under it.

## Phase 4: User Story 3 — deleting an aspect without losing its risk or policy (Priority: P2)

**Goal**: A consultant can remove an aspect that doesn't apply to this engagement; its
own assessment goes with it, but any risk or policy it had sourced survives.

**Independent Test**: On an aspect with an assessment, a risk, and a policy, delete it.
Confirm the tab and its assessment are gone, but the risk (Risk Register) and the policy
(Policy Library) are both still there, reading "Added manually."

- [X] T017 [US3] Write `tests/integration/governance.test.ts` tests for a new
      `deleteGovernanceAspect({ workspaceId, aspectId })` action, proving research.md
      Decision 2 specifically: an aspect with an assessment that has a checklist item
      carrying both a linked policy draft and a linked risk — after deletion, the
      aspect, the assessment, and the checklist item are gone, but the policy draft
      (`checklistItemId` now `null`) and the risk (`sourceItemId` now `null`) both still
      exist and are queryable; an aspect with no assessment yet deletes cleanly; non-EDITOR
      access is rejected; a mismatched/missing `aspectId` returns not-found. Confirm these
      fail before T018 exists.
- [X] T018 [US3] Implement `deleteGovernanceAspect` in `lib/actions/governance.ts`, in a
      transaction, in the exact order research.md Decision 2 requires: find the aspect's
      assessment and its checklist item ids (if any) → `governancePolicyDraft.updateMany`
      to null out `checklistItemId` for every policy linked to one of those items → delete
      the assessment (cascades checklist items; each item's risk already survives via the
      existing `SetNull` on `sourceItem`) → delete the aspect row.
- [X] T019 [US3] Make T017 pass, then mutation-check: skip the policy-detach step (let the
      default cascade run) and confirm the now-missing-policy assertion catches it; then
      restore.
- [X] T020 [US3] Add a delete control to each tab in `governance-assessment-panel.tsx`
      (confirm-before-delete, matching the existing pattern already used for risks and
      policies on this page) that calls `deleteGovernanceAspect`; on success, if the
      deleted aspect was the active tab, select a remaining one (or the no-aspects empty
      state if none remain — FR-010).
- [X] T021 [US3] Extend `tests/e2e/governance-aspects.spec.ts`: deleting an aspect with an
      assessment, a risk, and a policy removes the tab and the assessment, but the risk
      and the policy are still visible (now "Added manually") from the Risk Register and
      Policy Library sections; deleting the aspect currently being viewed moves the view
      to a remaining aspect, not a blank tab.

**Checkpoint**: all three user stories are independently functional — an aspect can be
added, renamed, and deleted, and nothing a consultant has already recorded is ever
silently lost.

## Phase 5: Polish

- [ ] T022 Run `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`,
      `pnpm exec playwright test` and report counts. Do not edit while a run is in flight.
- [ ] T023 Blast-radius check: `lib/domain/governance-findings.ts`,
      `lib/ai/governance-generator.ts`, and every non-governance page/action must be
      unchanged by this feature — confirm via `git diff` against those paths.
- [ ] T024 Run [quickstart.md](./quickstart.md)'s manual validation end to end (all four
      scenarios, including the pre/post-migration comparison in Scenario 1) and record
      the result.

## Dependencies

- Phase 1 blocks everything: the schema and the shared name list every later phase reads
  or writes.
- T007 (rewiring existing actions to `aspectId`) blocks T008-T012 and effectively all of
  Phase 2 onward — nothing in the UI can query real aspects until the actions accept
  real ids.
- T012 (removing the old static list) should land last within Phase 2, once every
  remaining import has been fixed in the tasks before it — doing it earlier would break
  the build mid－phase.
- Phase 3 and Phase 4 both depend on Phase 2's `aspects` prop and tab-bar wiring existing
  first, but are otherwise independent of each other.
- Phase 2 alone (add) is the MVP the user asked for first ("add options"); Phases 3-4
  (rename, delete) complete the full "edit, delete and add" request.

## Implementation Strategy

**MVP first**: Phase 1 → Phase 2 → stop and validate against quickstart.md Scenarios 1-2.
That alone lets a consultant add a client-specific aspect, the reported gap's most basic
form. Phase 3 (rename) and Phase 4 (delete, with its survival guarantee) are clean
follow-on slices, in either order, with no rework of Phase 2.
