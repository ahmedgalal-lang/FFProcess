# Tasks: A Governing Policy for Every Aspect

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

## Phase 1: Foundational

- [X] T001 Add `governsAspectId` (unique, SetNull) and the back-relation in `prisma/schema.prisma`; migrate, generate, restart the dev server.
- [X] T002 Move the activity logger to `lib/data/governance-activity.ts` as `logGovernanceActivity`; `governance.ts` imports it.

## Phase 2: User Story 1 — see and designate (P1) 🎯 MVP

- [X] T003 [US1] Write `tests/unit/governing-policy.test.ts` for `aspectPolicyState` and `tests/integration/governing-policy.test.ts` for `setGoverningPolicy`: designate, replace (old one unlinked, kept), clear; a policy governing another aspect refused with its name; another workspace's aspect or policy not-found; VIEWER forbidden; activity entries; deleting the aspect keeps the policy; deleting the policy frees the aspect. Confirm they fail.
- [X] T004 [US1] Implement `lib/domain/governing-policy.ts` and `setGoverningPolicy`.
- [X] T005 [US1] Build `governing-policy-panel.tsx` (current policy with status and Open, Change, Remove; empty state) in the assessment panel; "Governs: X" in the Policy Library; wire `page.tsx`.

## Phase 3: User Story 2 — create from template, AI, or by hand (P2)

- [X] T006 [US2] Write `tests/unit/policy-templates.test.ts` (14 templates with bodies; each default aspect's template ranked first; keyword match for custom names; `{{company}}` filled) and integration tests for `createGoverningPolicy`, `draftGoverningPolicyWithAi` (profile gate, AI unavailable, aspect already governed refused) and generate (creates one when none, leaves an existing one). Confirm they fail.
- [X] T007 [US2] Write the template catalogue; implement the two actions, `runGoverningPolicyDraft`, and the assessment's `governingPolicy`.
- [X] T008 [US2] Add the template picker, AI draft and write-by-hand forms to the panel's empty state.

## Phase 4: User Story 3 — completeness (P3)

- [X] T009 [US3] Tests: dashboard tile; report builder's governing-policy rows. Confirm they fail.
- [X] T010 [US3] Tab marker; summary tile; report subsection in the preview and PPTX.
- [X] T011 Write `tests/e2e/governing-policy.spec.ts` for the quickstart (with axe).

## Phase 5: Polish

- [X] T012 Lint, `tsc --noEmit`, full Vitest and Playwright suites.
- [X] T013 Blast-radius check via `git diff --stat`.
      Result: schema + one additive migration; the new template catalogue,
      policy-state helper, actions and panel; the shared activity logger
      moved to `lib/data/governance-activity.ts`; generate drafts a
      governing policy only when an aspect has none; the tab marker is an
      accessible description, so tab names are unchanged; the Policy
      Library, summary panel, printed report and PPTX show it. Vitest
      818/818.
