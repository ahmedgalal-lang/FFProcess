# Tasks: Policy Lifecycle

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Tests are included. FR-008 (editing an Approved/Published policy resets it to
Draft) and FR-010 (regeneration never silently touches a non-Draft policy)
are business rules with real failure modes if skipped — tested first.
FR-010's test is a deliberate exception to red-then-green: research.md
Decision 3 traced the existing code and confirmed the guarantee already
holds, so this test is written to *pin* that invariant against regression,
not to drive new implementation — it should pass immediately and stay
passing through every later task in this file.

## Phase 1: Foundational — schema and migration (blocks every slice)

- [ ] T001 Add `enum GovernancePolicyLifecycleStatus` (DRAFT/IN_REVIEW/
      APPROVED/PUBLISHED/RETIRED) to `prisma/schema.prisma`; add
      `lifecycleStatus` (default DRAFT), `approvedByUserId`, `approvedAt`,
      `effectiveDate`, `reviewDueDate` to `GovernancePolicyDraft`; add new
      models `GovernancePolicyVersion` and `GovernancePolicyAcknowledgement`
      (data-model.md); add the two back-relation arrays to `User`
      (`policyVersionsAuthored`, `policiesApproved`) and one to `Person`
      (`policyAcknowledgements`).
- [ ] T002 Run `pnpm exec prisma migrate dev --name policy_lifecycle` (purely
      additive — no `--create-only`/hand-editing needed, research.md
      Decision 7) and `pnpm exec prisma generate`. Restart the dev server
      afterward (a running `pnpm dev` process keeps its stale in-memory
      Prisma Client and won't see the new models/columns otherwise — the
      exact false-positive that cost real time during spec 017). Confirm
      every existing policy row reads `lifecycleStatus: "DRAFT"`.

**Checkpoint**: schema and generated client are ready; every later task can
now reference the new columns/models/actions.

## Phase 2: User Story 1 — draft to approved, published, with history (Priority: P1) 🎯 MVP

**Goal**: A policy can move Draft → In Review → Approved → Published →
Retired, with a full version history and a hard rule that editing an
Approved/Published policy resets it to Draft.

**Independent Test**: Write a policy, submit it, approve it as an Admin,
publish it, confirm its version history is complete; edit the published
policy and confirm it drops back to Draft; regenerate its source assessment
and confirm nothing about it changes.

### Tests for User Story 1

- [ ] T003 [US1] Write `tests/integration/governance.test.ts` tests for
      version history: `addGovernancePolicy` creates exactly one
      `GovernancePolicyVersion` (version 1, matching the policy's initial
      title/body, attributed to the caller); `updatePolicyDraft` creates
      version 2 with the new content while version 1 stays retrievable and
      unchanged; a policy created inside `generateGovernanceAssessment`'s
      transaction also gets version 1, attributed to whoever triggered the
      regenerate. Confirm these fail before T007 exists.
- [ ] T004 [US1] Write tests for the reset-to-Draft rule (FR-008): approve
      and publish a policy, then edit it via `updatePolicyDraft`; confirm
      `lifecycleStatus` reverts to `DRAFT` and `approvedByUserId`/
      `approvedAt` are cleared. Confirm editing a `DRAFT` or `IN_REVIEW`
      policy leaves `lifecycleStatus` unchanged. Confirm these fail before
      T008 exists.
- [ ] T005 [US1] Write tests for `submitPolicyForReview` / `approvePolicyDraft`
      / `publishPolicyDraft` / `retirePolicyDraft`: the correct-state happy
      path for each (approver and timestamp recorded on approve; effective
      date — input or today — recorded on publish); each rejected from the
      wrong starting `lifecycleStatus`, naming the actual one; an EDITOR can
      submit but is rejected (FORBIDDEN) from approve/publish/retire; an
      ADMIN can do all four; a mismatched/missing `policyId` returns
      not-found for each. Confirm these fail before T009-T012 exist.
- [ ] T006 [US1] Write the FR-010 regression test: publish a policy that was
      drafted from a checklist item, regenerate that aspect's assessment,
      and assert the policy's `title`, `body`, and `lifecycleStatus` are
      completely unchanged (research.md Decision 3). This test should pass
      immediately, before any other task in this phase — it pins existing,
      already-correct behavior rather than driving new code.

### Implementation for User Story 1

- [ ] T007 [US1] In `lib/actions/governance.ts`, make `updatePolicyDraft`,
      `addGovernancePolicy`, and `generateGovernanceAssessment`'s
      policy-creation step each insert a `GovernancePolicyVersion` row
      (`versionNumber` = current max for that policy + 1, `createdByUserId`
      = `access.data.userId`) in the same transaction as their existing
      create/update.
- [ ] T008 [US1] In `updatePolicyDraft`, reset `lifecycleStatus` to `DRAFT`
      and clear `approvedByUserId`/`approvedAt` whenever the policy being
      saved was `APPROVED` or `PUBLISHED` (FR-008).
- [ ] T009 [US1] Implement `submitPolicyForReview({ workspaceId, policyId })`
      in `lib/actions/governance.ts` — EDITOR; `DRAFT` → `IN_REVIEW`; rejects
      any other starting status.
- [ ] T010 [US1] Implement `approvePolicyDraft({ workspaceId, policyId })` —
      ADMIN; `IN_REVIEW` → `APPROVED`, sets `approvedByUserId`/`approvedAt`;
      rejects any other starting status.
- [ ] T011 [US1] Implement `publishPolicyDraft({ workspaceId, policyId,
      effectiveDate? })` — ADMIN; `APPROVED` → `PUBLISHED`, sets
      `effectiveDate` (the given date, or today when omitted); rejects any
      other starting status.
- [ ] T012 [US1] Implement `retirePolicyDraft({ workspaceId, policyId })` —
      ADMIN; `PUBLISHED` → `RETIRED`; rejects any other starting status.
- [ ] T013 [US1] In `governance-policy-drawer.tsx`: extend `PolicyT` with
      `lifecycleStatus`, `approvedByUserName: string | null`, `approvedAt:
      string | null`, `effectiveDate: string | null`, and `versions: {
      versionNumber: number; title: string; body: string; authorName:
      string; createdAt: string }[]`. Add a lifecycle status badge, an
      expandable version-history list (newest first), and Submit/Approve/
      Publish/Retire buttons — each shown only when
      `useWorkspaceAccess().accessLevel` and the policy's current
      `lifecycleStatus` both allow it (EDITOR for submit, ADMIN for the
      other three).
- [ ] T014 [US1] Wire `page.tsx` to populate the new `PolicyT` fields —
      `lifecycleStatus`, `approvedByUserName` (joined from `User.name`),
      `approvedAt`, `effectiveDate`, and each policy's `versions` (ordered
      `versionNumber` desc).
- [ ] T015 [US1] Add a lifecycle status badge to each row in
      `governance-policy-library.tsx`, alongside the existing recommendation
      -status badge.
- [ ] T016 [US1] Write `tests/e2e/policy-lifecycle.spec.ts` covering
      quickstart.md Scenarios 1 and 2: the full Draft → In Review → Approved
      → Published → (edit resets to Draft) → re-published → Retired path
      with version history visible at each step; regenerating a published
      policy's source assessment leaves it untouched.

**Checkpoint**: a policy has a real, enforced lifecycle and a complete
history. Shippable on its own — review-due flagging and acknowledgement
tracking (User Stories 2/3) are additive from here.

## Phase 3: User Story 2 — flagging a policy overdue for review (Priority: P2)

**Goal**: A Published policy past its review-due date is visibly flagged in
the Policy Library.

**Independent Test**: Publish a policy, set a past review-due date, confirm
the Policy Library flags it; set a future date, confirm the flag clears;
confirm a non-Published policy is never flagged regardless of its date.

### Tests for User Story 2

- [ ] T017 [P] [US2] Write `tests/unit/policy-lifecycle.test.ts` for a new
      pure function `isPolicyOverdueForReview(lifecycleStatus,
      reviewDueDate, today)`: `PUBLISHED` with a past date → `true`;
      `PUBLISHED` with a future or `null` date → `false`; every other
      `lifecycleStatus` (`DRAFT`/`IN_REVIEW`/`APPROVED`/`RETIRED`) with a
      past date → `false` regardless. Confirm these fail before T019 exists.
- [ ] T018 [US2] Write `tests/integration/governance.test.ts` tests for
      `setPolicyReviewDueDate({ workspaceId, policyId, reviewDueDate })`:
      sets or clears the date at any `lifecycleStatus`; EDITOR-gated;
      ownership-checked (mismatched/missing `policyId` → not-found).
      Confirm these fail before T020 exists.

### Implementation for User Story 2

- [ ] T019 [P] [US2] Add `isPolicyOverdueForReview` to a new
      `lib/domain/policy-lifecycle.ts` — a pure function (no DB/clock; `today`
      is a parameter), matching this codebase's existing domain-module
      pattern.
- [ ] T020 [US2] Implement `setPolicyReviewDueDate` in
      `lib/actions/governance.ts`.
- [ ] T021 [US2] Wire `page.tsx` to compute `needsReview` per policy via
      `isPolicyOverdueForReview(policy.lifecycleStatus, policy.reviewDueDate,
      new Date())` and add it to `PolicyT`.
- [ ] T022 [US2] Add a review-due date field to `governance-policy-drawer.tsx`
      (settable at any `lifecycleStatus`) and a "Needs review" flag to
      `governance-policy-library.tsx`'s row rendering when `needsReview` is
      true.
- [ ] T023 [US2] Extend `tests/e2e/policy-lifecycle.spec.ts` with quickstart.md
      Scenario 3.

**Checkpoint**: User Stories 1 and 2 both work independently.

## Phase 4: User Story 3 — acknowledgement tracking (Priority: P3)

**Goal**: A consultant can record, on behalf of the workspace's People
directory, who has acknowledged a Published policy.

**Independent Test**: Publish a policy, mark two people as having
acknowledged it, confirm both appear with a date; unmark one and confirm it
reverts; confirm acknowledgement is never offered on a Draft/In Review/
Approved policy.

### Tests for User Story 3

- [ ] T024 [US3] Write `tests/integration/governance.test.ts` tests for
      `markPolicyAcknowledgement({ workspaceId, policyId, personId })` /
      `unmarkPolicyAcknowledgement({ workspaceId, policyId, personId })`:
      marking records the person and a timestamp; marking the same person
      twice is idempotent (no duplicate row); rejected with a validation
      error when the policy's `lifecycleStatus` is `DRAFT`/`IN_REVIEW`/
      `APPROVED` (FR-014 — only `PUBLISHED` or `RETIRED` accept it);
      unmarking deletes the row (no-op if absent); both EDITOR-gated;
      both ownership-checked against `workspaceId` for *both* the policy
      and the person (a person from a different workspace is rejected the
      same as a mismatched policy). Confirm these fail before T026-T027
      exist.
- [ ] T025 [US3] Write a test confirming the schema's cascade behavior
      (research.md Decision 5): deleting a `Person` removes their
      `GovernancePolicyAcknowledgement` rows along with them.

### Implementation for User Story 3

- [ ] T026 [US3] Implement `markPolicyAcknowledgement` in
      `lib/actions/governance.ts` — EDITOR; ownership-checks both the policy
      and the person against `workspaceId`; rejects unless `lifecycleStatus`
      is `PUBLISHED` or `RETIRED`; upserts (idempotent on a repeat mark).
- [ ] T027 [US3] Implement `unmarkPolicyAcknowledgement` — EDITOR; deletes the
      acknowledgement row if present, no-op otherwise.
- [ ] T028 [US3] Wire `page.tsx` to load each policy's acknowledgements
      (joined with `Person.name`) and reuse the workspace's already-loaded
      People list (the same one RACI/Authority already query — no new
      query), adding both to `PolicyT`.
- [ ] T029 [US3] Add an acknowledgement checklist to
      `governance-policy-drawer.tsx` against the workspace's People
      directory, visible only when `lifecycleStatus` is `PUBLISHED` or
      `RETIRED`, with mark/unmark controls and each acknowledgement's date
      shown.
- [ ] T030 [US3] Extend `tests/e2e/policy-lifecycle.spec.ts` with
      quickstart.md Scenario 4.

**Checkpoint**: all three user stories are independently functional — a
policy can be taken through its full lifecycle, flagged for review, and
tracked for acknowledgement, with nothing silently lost or overwritten.

## Phase 5: Polish

- [ ] T031 Run `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`,
      `pnpm exec playwright test` and report counts. Do not edit while a run
      is in flight.
- [ ] T032 Blast-radius check: `lib/domain/governance-findings.ts`,
      `lib/ai/governance-generator.ts`, `governance-risk-register.tsx`,
      `governance-assessment-panel.tsx`, and every non-governance page/action
      must be unchanged by this feature — confirm via `git diff` against
      those paths.
- [ ] T033 Run [quickstart.md](./quickstart.md)'s manual validation end to
      end (all four scenarios) and record the result.

## Dependencies

- Phase 1 blocks everything: every later action references the new columns
  and models.
- T007 (version history) and T008 (reset rule) both edit `updatePolicyDraft`
  and should land in that order — T008 assumes T007's version-insert is
  already in place so the "current max version" it reads is correct.
- T009-T012 (the four transition actions) are independent of each other
  (different code, same file) but all depend on T001/T002.
- Phase 3 (review-due) and Phase 4 (acknowledgement) both depend on Phase
  2's `PolicyT` shape and lifecycle actions existing, but are otherwise
  independent of each other — either order works.
- Phase 2 alone (the core lifecycle) is the MVP; Phases 3-4 are additive
  slices with no rework of Phase 2.

## Implementation Strategy

**MVP first**: Phase 1 → Phase 2 → stop and validate against quickstart.md
Scenarios 1-2. That alone closes the reported gap's core — "no versioning,
no draft→review→approve workflow." Phase 3 (review-due flagging) and Phase
4 (acknowledgement tracking) are clean follow-on slices, in either order,
with no rework of Phase 2.
