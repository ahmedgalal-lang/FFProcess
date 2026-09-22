# Tasks: AI Governance Framework Generator

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Contracts**:
[governance-ai.md](./contracts/governance-ai.md), [governance-actions.md](./contracts/governance-actions.md)

Tests are included: the reconciliation rule (FR-007/FR-014, SC-003/SC-004/SC-006) is a
governed business rule under Constitution Principle III — it decides whether a
consultant's tracked progress survives — and gets the test-first treatment
`review-findings.ts` already had, mutation-checked the same way every fix this session
has been.

## Phase 1: Schema

- [x] T001 Add `governanceCompanySize`/`governanceJurisdiction` to `Workspace`, and the `GovernanceFocusArea`/`GovernanceItemPhase`/`GovernanceItemStatus`/`RiskLikelihood`/`RiskImpact`/`RiskStatus` enums, `GovernanceAssessment`, `GovernanceChecklistItem`, `GovernancePolicyDraft`, `GovernanceRisk` models to `prisma/schema.prisma`, per `data-model.md`.
- [x] T002 Run `pnpm exec prisma migrate dev --name governance_generator` (non-interactive per this session's earlier `prisma-cli` note: `prisma migrate dev` requires a TTY; use `pnpm exec prisma migrate dev --name governance_generator --skip-generate` and if that still fails non-interactively, fall back to `prisma db push` for local dev and hand-write the migration SQL file, checking `references/agent-safety.md` first for any destructive-command consent gate — this command is additive only, so none should apply). Run `pnpm exec prisma generate` after.

## Phase 2: Foundational — reconciliation logic (blocks every user story)

- [x] T003 [P] Write `tests/unit/governance-findings.test.ts`: checklist-item reconciliation scoped to (workspaceId, focusArea) — a DONE/DISMISSED item's normalized title is never recreated; a fresh run's items not matching a tracked title are the only ones inserted. Mirrors `review-findings.test.ts`'s coverage.
- [x] T004 [P] Extend the same file: risk reconciliation, scoped to workspaceId only (not focus area, per FR-011) — a risk already hand-scored (any field ever set directly) is never overwritten by a later run's matching title; an EDITED policy's body is never overwritten by a re-run's fresh draft for the same checklist item.
- [x] T005 Implement `lib/domain/governance-findings.ts`: re-export `normalizeFindingTitle` from `review-findings.ts` (don't duplicate it — research.md Decision 3), plus `partitionNewChecklistItems`, `partitionNewRisks`, and a `HAND_MANAGED` guard (a risk/policy is hand-managed once any of its own fields have been set directly, not only once a run has touched it) that protects a row from being overwritten by reconciliation.
- [x] T006 Make T003/T004 pass, then mutation-check: reset a DONE item to OPEN on reconcile, recreate a DISMISSED item, overwrite an EDITED policy body, overwrite a hand-scored risk — confirm each mutation is caught.

**Checkpoint**: the rule that protects a consultant's tracked progress is correct and proven in isolation.

## Phase 3: User Story 1 — generate a governance assessment (P1)

- [x] T007 [US1] Create `lib/ai/governance-generator.ts`: `SYSTEM_PROMPT` (the pasted role/pillars/output-shape definition, adapted per contracts/governance-ai.md), the Gemini `Schema` for `GovernanceAssessmentResult` (summary/checklist/policies/risks), and `runGovernanceAssessment(promptText)` calling `generateStructured` — mirrors `lib/ai/process-review.ts` structurally.
- [x] T008 [US1] Create `lib/actions/governance.ts`'s `setGovernanceProfile` (EDITOR, Zod-validated, writes the two new Workspace columns).
- [x] T009 [US1] Create `generateGovernanceAssessment` in the same file: refuses with `validationError` when profile/industry unset (FR-003) rather than calling the model; builds the prompt text from workspace profile + industry + focus area + already-tracked titles (contracts/governance-ai.md); calls `runGovernanceAssessment`; on success, reconciles via `governance-findings.ts` and persists (upsert the assessment row, insert only new checklist items/risks, insert policies for new items that name one).
- [x] T010 [US1] Build `app/(app)/workspaces/[workspaceId]/governance/governance-profile-form.tsx`: company size + jurisdiction fields beside the existing industry chip, calling `setGovernanceProfile`. Mirrors an existing small settings form's shape (e.g. the workspace settings page) rather than inventing new form conventions.
- [x] T011 [US1] Build `app/(app)/workspaces/[workspaceId]/governance/governance-assessment-panel.tsx`: focus-area tabs, the five-pillar strip (static — the pillars don't change), "Regenerate" button calling `generateGovernanceAssessment` via `useTransition`, and the summary/checklist rendering — mirrors `review-panel.tsx`'s state shape (`useState` seeded from server props, `router.refresh()` after a mutating action).
- [x] T012 [US1] Wire both into `app/(app)/workspaces/[workspaceId]/governance/page.tsx`, above the existing Key Control Points/KPIs section (which is untouched), reading the new tables the same way the page already reads `AuthorityAssignment` — direct `prisma` queries in the Server Component, no new data-fetching pattern.
- [x] T013 [US1] Write `tests/e2e/governance-assessment.spec.ts`: set a profile, generate an assessment for one focus area with `GEMINI_API_KEY` unset, assert the "not configured" message appears (FR-010) rather than an error or silent no-op. Confirm this fails meaningfully against unimplemented code first.
- [x] T014 [US1] Extend the same spec: with a fixture that stubs `runGovernanceAssessment`'s result (same no-live-model pattern `ai-review`'s own tests use — call the action layer directly, not through a live Gemini call) confirm FR-003 (refused without a profile), FR-004 (all three-plus-risks outputs land), and SC-002's spirit (the persisted summary contains the workspace's actual industry/size strings, not placeholder text).

**Checkpoint**: a consultant can go from an unset profile to a persisted three-part assessment.

## Phase 4: User Story 2 — open and act on a draft policy (P2)

- [x] T015 [US2] Add `updatePolicyDraft` to `lib/actions/governance.ts` (EDITOR; setting `body` also sets status EDITED, per T005's hand-managed guard).
- [x] T016 [US2] Build `app/(app)/workspaces/[workspaceId]/governance/governance-policy-drawer.tsx`: opens a policy's full draft (mirrors the mockup's policy panel — headed sections, editable body), save calling `updatePolicyDraft`.
- [x] T017 [US2] Wire "View draft policy" links on checklist items (from the mockup) to open the drawer for that item's linked `GovernancePolicyDraft`.
- [x] T018 [US2] Extend `tests/e2e/governance-assessment.spec.ts`: open a draft policy, edit and save it, regenerate the assessment, confirm the edited body survives untouched (SC-004).

## Phase 5: User Story 3 — Risk Register and Policy Library (P2)

- [x] T019 [US3] Add `addGovernanceRisk` and `updateGovernanceRisk` to `lib/actions/governance.ts` (EDITOR; per contracts/governance-actions.md).
- [x] T020 [US3] Build `app/(app)/workspaces/[workspaceId]/governance/governance-risk-register.tsx`: the table from the mockup (risk/likelihood/impact/derived level chip/owner/status), "+ Add risk" opening an inline or modal form, status/score editable inline calling `updateGovernanceRisk`.
- [x] T021 [US3] Build `app/(app)/workspaces/[workspaceId]/governance/governance-policy-library.tsx`: the flat cross-focus-area list from the mockup, querying `GovernancePolicyDraft` across every assessment in the workspace (contracts/governance-actions.md's "Reading" section — a direct query, no new action), each row opening `governance-policy-drawer.tsx`.
- [x] T022 [US3] Wire both into `page.tsx`, positioned as in the mockup: Risk Register after the profile/pillars section, Policy Library before the single-policy detail view.
- [x] T023 [US3] Extend `tests/e2e/governance-assessment.spec.ts`: generate assessments for two different focus areas, confirm the Risk Register and Policy Library each show items from both without switching tabs (SC-005); re-score a risk by hand, regenerate, confirm the hand-set score survives (SC-006).

## Phase 6: User Story 4 — reconciliation, end to end (P2)

- [x] T024 [US4] Extend `tests/e2e/governance-assessment.spec.ts`: mark a checklist item done, regenerate the same focus area's assessment (via a stubbed result reusing some of the same titles), confirm the done item stays done and is not duplicated (FR-007, SC-003).
- [x] T025 [US4] Extend the same spec: dismiss an item, regenerate, confirm it does not reappear as open.

## Phase 7: Access gating

- [x] T026 Extend `tests/e2e/viewer-read-only.spec.ts` with a governance case: a VIEWER can open `/governance` and read an existing assessment, Risk Register, and Policy Library, but sees no profile form, no "Regenerate," no "+ Add risk," and a direct call to any governance action is refused server-side (mirrors this file's existing pattern for every other EDITOR-gated feature).

## Phase 8: Polish

- [x] T027 Run the full suites — `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm exec tsc --noEmit` — and report the counts. Do not edit any file while a run is in flight.
- [x] T028 Read the real rendered page (`pnpm dev`, sign in, `/workspaces/workspace-acme/governance`) against the approved mockup (https://claude.ai/artifact/WwGMgev9B2EF5zHhoViFjC) — spacing, status pill legibility, whether the draft policy reads as a document — the check nothing automated catches.
- [x] T029 Re-read `spec.md`'s success criteria one by one against what was actually measured, and record each one's result in `specs/012-governance-generator/checklists/requirements.md`. Any criterion not measured is not met.

## Dependencies

- T001 blocks T002; T002 blocks everything that touches the database (T005 onward).
- Phase 2 (T003–T006) blocks every later phase: US1's persistence (T009) calls the
  reconciliation module T005 builds.
- T003/T004 must fail before T005 starts; T006 closes the loop.
- Phase 3 (US1) before Phases 4–6: US2/US3/US4 all extend the assessment US1 creates.
- T026 (access gating) can run any time after Phase 3 lands a generate action to gate.

## Parallel opportunities

- T003 and T004 are independent assertions in one new file, marked [P].
- T015 (policy action) and T019 (risk actions) touch the same file
  (`lib/actions/governance.ts`) sequentially, not in parallel, once US1's action exists
  in it.
- T020 and T021 are independent new components and may be built in parallel.

## MVP scope

Phases 1–3: schema, reconciliation, and a working generate-and-view cycle for one
focus area. That is independently demonstrable and is what SC-001 measures directly.
Phases 4–6 are what the user asked for by name after the mockup review — not optional
polish, but they build on Phase 3's assessment existing first.
